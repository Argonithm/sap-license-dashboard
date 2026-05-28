"""Generador de snapshot.json para el dashboard `sap_license_dashboard.html`.

Corre el motor SLIM_UCH-equivalent (HANA) y produce un JSON con el mismo
esquema que consume el dashboard. Reemplaza el camino manual
SLIM_UCH -> Excel -> SharePoint.

Salida por defecto: <raiz_repo>/snapshot.json (script vive en scripts/).
Se puede sobrescribir con la variable de entorno SNAPSHOT_OUT.

Requiere: hdbcli, openpyxl no necesario aqui. Credencial via hana_conn
(pass_sap.txt fuera del repo, ver SAP_CRED_FILE).
"""
from __future__ import annotations
import os
import json
from datetime import date, datetime, timezone
from pathlib import Path

import hana_conn

OUT_PATH = (
    Path(os.environ['SNAPSHOT_OUT'])
    if os.environ.get('SNAPSHOT_OUT')
    else Path(__file__).resolve().parent.parent / 'snapshot.json'
)
PR_LIST = '06'
MANDANTE_ID = 'PRD100'
MANDANTE_LABEL = 'Produccion 100'
BUDGET = 60

LIC_TO_STR = {
    'GA': 'Developer', 'GB': 'Advanced', 'GC': 'Core', 'GD': 'Self-Service',
    'GE': 'Sin clasificar', 'GF': 'Developer', 'GG': 'Sin clasificar', 'NC': 'Sin clasificar',
}
FUE_MAP = {'Developer': 2.0, 'Advanced': 1.0, 'Core': 0.2, 'Self-Service': 0.033, 'Sin clasificar': 0.0}

SQL_ENGINE = """
WITH
  hoy AS (SELECT TO_VARCHAR(CURRENT_DATE,'YYYYMMDD') AS T FROM DUMMY),
  active_users AS (
    SELECT u.BNAME, u.UFLAG, u.GLTGV, u.GLTGB, u.TRDAT, u.LTIME, u.CLASS AS USER_GROUP
    FROM SAPHANADB.USR02 u, hoy
    WHERE u.MANDT = '100'
      AND u.USTYP = 'A'
      AND (u.GLTGB IN ('00000000','99991231') OR u.GLTGB >= hoy.T)
      AND u.BNAME NOT IN ('SAP*','DDIC','EARLYWATCH','SAPCPIC','TMSADM')
  ),
  user_role_auth AS (
    SELECT au.UNAME, a.OBJECT, a.FIELD, a.LOW, NULLIF(a.HIGH,'') AS HIGH
    FROM SAPHANADB.AGR_USERS au
    JOIN active_users u ON u.BNAME = au.UNAME
    JOIN SAPHANADB.AGR_1251 a ON a.MANDT = au.MANDT AND a.AGR_NAME = au.AGR_NAME, hoy
    WHERE au.MANDT = '100'
      AND COALESCE(au.EXCLUDE,'') <> 'X'
      AND (au.TO_DAT = '00000000' OR au.TO_DAT >= hoy.T)
      AND COALESCE(a.DELETED,'') <> 'X'
  ),
  matches AS (
    SELECT ura.UNAME, r.STEP
    FROM user_role_auth ura
    JOIN SAPHANADB.SLIMPC_RULESET r
         ON r.OBJCT = ura.OBJECT AND r.FIELD = ura.FIELD
    WHERE ura.LOW = '*'
       OR (ura.HIGH IS NULL AND r.VALUE = ura.LOW)
       OR (ura.HIGH IS NOT NULL AND r.VALUE BETWEEN ura.LOW AND ura.HIGH)
  ),
  best AS (SELECT UNAME, MIN(STEP) AS BEST_STEP FROM matches GROUP BY UNAME)
SELECT
  au.BNAME,
  COALESCE(addr.NAME_TEXTC, addr.NAME_FIRST || ' ' || addr.NAME_LAST, au.BNAME) AS NOMBRE,
  COALESCE(rm.USER_TYPE, 'NC') AS LIC_CODE,
  au.UFLAG, au.GLTGB, au.TRDAT, au.USER_GROUP
FROM active_users au
LEFT JOIN best b ON b.UNAME = au.BNAME
LEFT JOIN SAPHANADB.SLIMPC_RULS_MAP rm ON rm.STEP = b.BEST_STEP AND rm.PR_LIST = ?
LEFT JOIN SAPHANADB.USER_ADDR addr ON addr.MANDT='100' AND addr.BNAME = au.BNAME
ORDER BY au.BNAME
"""


def parse_d(s):
    s = (s or '').strip()
    if not s or s in ('00000000', '99991231'):
        return None
    try:
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except (ValueError, IndexError):
        return None


def map_status(user_group, uflag, days_inactive):
    g = (user_group or '').upper()
    if uflag and uflag > 0:
        return 'Inactivo'
    if days_inactive is not None and days_inactive > 90:
        return 'Inactivo'
    if 'EXTERN' in g:
        return 'Externo'
    if 'TECNIC' in g or 'TÉCNIC' in g or 'TECHN' in g:
        return 'Técnico'
    return 'Activo'


def main():
    conn = hana_conn.connect()
    cur = conn.cursor()
    cur.execute(SQL_ENGINE, (PR_LIST,))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    cur.close(); conn.close()

    today = date.today()
    users = []
    fue_total = 0.0
    for r in rows:
        d = dict(zip(cols, r))
        code = (d['LIC_CODE'] or 'NC').strip()
        license_str = LIC_TO_STR.get(code, 'Sin clasificar')
        fue = FUE_MAP[license_str]
        fue_total += fue
        trdat = parse_d(d.get('TRDAT'))
        days = (today - trdat).days if trdat else 999
        status = map_status(d.get('USER_GROUP'), d.get('UFLAG'), days)
        users.append({
            'user': d['BNAME'],
            'name': (d['NOMBRE'] or '').strip(),
            'licenseType': license_str,
            'status': status,
            'fue': fue,
            'lastLogin': trdat.isoformat() if trdat else '—',
            'daysInactive': days,
        })

    fue_total = round(fue_total, 3)
    today_iso = today.isoformat()

    historical = []
    if OUT_PATH.exists():
        try:
            prev = json.loads(OUT_PATH.read_text(encoding='utf-8'))
            prev_hist = prev.get('mandantes', {}).get(MANDANTE_ID, {}).get('historical', [])
            historical = [h for h in prev_hist if h.get('date') != today_iso]
        except Exception:
            pass
    historical.append({'date': today_iso, 'fue': fue_total})
    historical.sort(key=lambda h: h['date'])

    snapshot = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'mandantes': {
            MANDANTE_ID: {
                'label': MANDANTE_LABEL,
                'budget': BUDGET,
                'users': users,
                'historical': historical,
            }
        }
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')

    by_type = {}
    for u in users:
        by_type[u['licenseType']] = by_type.get(u['licenseType'], 0) + 1
    print(f'snapshot.json -> {OUT_PATH}')
    print(f'  Usuarios: {len(users)} · FUE total: {fue_total} / {BUDGET}')
    for t, n in sorted(by_type.items()):
        print(f'    {t:<18} {n:>4}')


if __name__ == '__main__':
    main()
