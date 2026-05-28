"""Lee credenciales HANA desde pass_sap.txt y entrega un helper de conexión.

El archivo de credenciales NUNCA se commitea (ver .gitignore). En el runner
self-hosted vive fuera del checkout, en una ruta fija. Se puede sobrescribir
con la variable de entorno SAP_CRED_FILE.
"""
import os
import re
from pathlib import Path
from hdbcli import dbapi

CRED_FILE = Path(os.environ.get('SAP_CRED_FILE', r'C:\dev\sap\pass_sap.txt'))


def load_creds():
    text = CRED_FILE.read_text(encoding='utf-8', errors='replace')
    out = {}
    for line in text.splitlines():
        m = re.match(r'\s*([^:]+?)\s*:\s*(.+?)\s*$', line)
        if not m:
            continue
        key, val = m.group(1).strip().lower(), m.group(2).strip()
        if 'servidor' in key or 'host' in key:
            out['host'] = val
        elif 'puerto' in key or 'port' in key:
            out['port'] = int(val)
        elif 'tenant' in key or 'base de datos' in key:
            out['tenant'] = val
        elif 'usuario' in key or 'user' in key:
            out['user'] = val
        elif 'contrase' in key or 'password' in key:
            out['password'] = val
    return out


def connect(schema='SAPHANADB'):
    c = load_creds()
    conn = dbapi.connect(
        address=c['host'],
        port=c['port'],
        user=c['user'],
        password=c['password'],
        encrypt=False,
    )
    if schema:
        cur = conn.cursor()
        cur.execute(f'SET SCHEMA "{schema}"')
        cur.close()
    return conn


if __name__ == '__main__':
    c = load_creds()
    print(f"Cred file: {CRED_FILE}")
    print(f"Host: {c['host']}  Port: {c['port']}  User: {c['user']}  Tenant: {c.get('tenant')}")
    try:
        conn = connect()
        cur = conn.cursor()
        cur.execute("SELECT CURRENT_USER, CURRENT_SCHEMA, DATABASE_NAME FROM \"DUMMY\", M_DATABASE")
        print('Connected:', cur.fetchone())
        cur.close(); conn.close()
    except Exception as e:
        print('CONNECTION FAILED:', type(e).__name__, e)
