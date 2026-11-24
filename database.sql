PRAGMA foreign_keys = ON;

-- PERFIS
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'Aluno',
    school TEXT,
    class_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- BARREIRAS
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT DEFAULT 'Reportado',
    author_id INTEGER,
    votes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (author_id)
    REFERENCES profiles(id)
);

-- VOTOS
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(report_id, user_id),

    FOREIGN KEY (report_id)
    REFERENCES reports(id),

    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
);

-- HISTÓRICO
CREATE TABLE IF NOT EXISTS report_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (report_id)
    REFERENCES reports(id)
);

-- NECESSIDADES DE PROFISSIONAIS
CREATE TABLE IF NOT EXISTS professional_needs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professional TEXT NOT NULL,
    shift TEXT,
    classroom TEXT,
    priority TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);PRAGMA foreign_keys = ON;

-- PERFIS
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'Aluno',
    school TEXT,
    class_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- BARREIRAS
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT DEFAULT 'Reportado',
    author_id INTEGER,
    votes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (author_id)
    REFERENCES profiles(id)
);

-- VOTOS
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(report_id, user_id),

    FOREIGN KEY (report_id)
    REFERENCES reports(id),

    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
);

-- HISTÓRICO
CREATE TABLE IF NOT EXISTS report_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (report_id)
    REFERENCES reports(id)
);

-- NECESSIDADES DE PROFISSIONAIS
CREATE TABLE IF NOT EXISTS professional_needs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    professional TEXT NOT NULL,
    shift TEXT,
    classroom TEXT,
    priority TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

import sqlite3

# Conecta ao banco (cria o arquivo se ele não existir)
conn = sqlite3.connect("escola.db")

# Ativa as chaves estrangeiras
conn.execute("PRAGMA foreign_keys = ON")

# Lê o arquivo SQL
with open("database.sql", "r", encoding="utf-8") as arquivo:
    sql = arquivo.read()

# Cria as tabelas
conn.executescript(sql)

conn.close()

print("Banco de dados criado com sucesso!")

#!/usr/bin/env python3
"""Servidor local Escola Para Todos com persistência SQLite (stdlib, sem dependências)."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sqlite3, json, os, urllib.parse
ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "escola_para_todos.db"

SAMPLE_REPORTS = [
 {"id":1,"sector":"Entrada","kind":"Falta de rampa","description":"A entrada principal possui degraus e não oferece uma rota acessível para pessoas que utilizam cadeira de rodas.","place":"Entrada principal","status":"Reportado","votes":12,"author":"Participante da comunidade","history":[{"status":"Reportado","date":"Registro inicial"}]},
 {"id":2,"sector":"Banheiros","kind":"Banheiro não adaptado","description":"O banheiro não possui barras de apoio e espaço adequado para manobra de cadeira de rodas.","place":"Bloco A","status":"Em andamento","votes":9,"author":"Participante da comunidade","history":[{"status":"Reportado","date":"Registro inicial"},{"status":"Em andamento","date":"Atualização demonstrativa"}]},
 {"id":3,"sector":"Salas de aula","kind":"Ausência de piso tátil","description":"Falta sinalização tátil para orientar a circulação de pessoas com deficiência visual.","place":"Corredor do 1º andar","status":"Reportado","votes":7,"author":"Participante da comunidade","history":[{"status":"Reportado","date":"Registro inicial"}]}
]
SAMPLE_SUPPORTS = [
 {"id":1,"professional":"Intérprete de Libras","shift":"Manhã","classroom":"8º ano A","level":"Urgente","description":"Necessidade de apoio à comunicação nas aulas."},
 {"id":2,"professional":"Auxiliar de sala","shift":"Tarde","classroom":"6º ano B","level":"Alta","description":"Demanda de apoio para participação nas atividades."}
]
def db():
 conn=sqlite3.connect(DB_PATH)
 conn.execute("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
 conn.execute("CREATE TABLE IF NOT EXISTS supports (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
 conn.execute("CREATE TABLE IF NOT EXISTS votes (voter_key TEXT NOT NULL, report_id TEXT NOT NULL, PRIMARY KEY(voter_key, report_id))")
 conn.execute("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
 if not conn.execute("SELECT value FROM app_meta WHERE key='initialized'").fetchone():
  for r in SAMPLE_REPORTS: conn.execute("INSERT OR REPLACE INTO reports VALUES(?,?)", (str(r['id']),json.dumps(r,ensure_ascii=False)))
  for a in SAMPLE_SUPPORTS: conn.execute("INSERT OR REPLACE INTO supports VALUES(?,?)", (str(a['id']),json.dumps(a,ensure_ascii=False)))
  conn.execute("INSERT INTO app_meta VALUES('initialized','1')")
 conn.commit()
 return conn

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
 def send_json(self,obj,status=200):
  raw=json.dumps(obj,ensure_ascii=False).encode('utf-8')
  self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(raw)
 def do_GET(self):
  if urllib.parse.urlparse(self.path).path=='/api/data':
   c=db(); reports=[json.loads(row[0]) for row in c.execute('SELECT payload FROM reports')]; supports=[json.loads(row[0]) for row in c.execute('SELECT payload FROM supports')]; votes=[int(r[0]) if str(r[0]).isdigit() else r[0] for r in c.execute('SELECT report_id FROM votes WHERE voter_key="local"')]; user_row=c.execute("SELECT value FROM app_meta WHERE key='user'").fetchone(); user=json.loads(user_row[0]) if user_row else None; c.close(); self.send_json({'reports':reports,'supports':supports,'voted':votes,'user':user}); return
  if urllib.parse.urlparse(self.path).path=='/api/health': self.send_json({'ok':True,'storage':'SQLite','database':'escola_para_todos.db'}); return
  return super().do_GET()
 def do_PUT(self):
  if urllib.parse.urlparse(self.path).path!='/api/data': return self.send_json({'error':'Not found'},404)
  try:
   size=int(self.headers.get('Content-Length','0')); payload=json.loads(self.rfile.read(size) or b'{}')
   reports=payload.get('reports',[]); supports=payload.get('supports',[]); voted=payload.get('voted',[]); user=payload.get('user')
   if not isinstance(reports,list) or not isinstance(supports,list) or not isinstance(voted,list): return self.send_json({'error':'Formato inválido'},400)
   c=db(); c.execute('BEGIN')
   c.execute('DELETE FROM reports'); c.execute('DELETE FROM supports'); c.execute('DELETE FROM votes WHERE voter_key="local"')
   for r in reports: c.execute('INSERT INTO reports VALUES(?,?)',(str(r.get('id')),json.dumps(r,ensure_ascii=False)))
   for a in supports: c.execute('INSERT INTO supports VALUES(?,?)',(str(a.get('id')),json.dumps(a,ensure_ascii=False)))
   for v in voted: c.execute('INSERT OR IGNORE INTO votes VALUES("local",?)',(str(v),))
   c.execute('INSERT OR REPLACE INTO app_meta(key,value) VALUES("user",?)',(json.dumps(user,ensure_ascii=False),))
   c.commit(); c.close(); self.send_json({'ok':True})
  except (ValueError,sqlite3.Error) as exc: self.send_json({'error':'Dados inválidos ou erro de banco'},400)
 def log_message(self,format,*args): print('[web]',format%args)
if __name__=='__main__':
 print('Escola Para Todos iniciando em http://localhost:8000')
 print('Banco de dados SQLite:', DB_PATH)
 ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
