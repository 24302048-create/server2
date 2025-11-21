// server/server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Usa un archivo sqlite en la carpeta server
const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

// Crear tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS miembros(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS publicaciones(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      contenido TEXT,
      fecha TEXT,
      FOREIGN KEY(usuario_id) REFERENCES miembros(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comentarios(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      publicacion_id INTEGER,
      comentario TEXT,
      fecha TEXT,
      FOREIGN KEY(usuario_id) REFERENCES miembros(id),
      FOREIGN KEY(publicacion_id) REFERENCES publicaciones(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comentarios_sobre_mi(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      comentario TEXT,
      fecha TEXT,
      FOREIGN KEY(usuario_id) REFERENCES miembros(id)
    )
  `);
});

// ----------------- Registro -----------------
app.post("/api/registro", (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) return res.json({ success: false, message: "Faltan datos" });

  const hash = bcrypt.hashSync(password, 10);

  db.run(
    "INSERT INTO miembros(nombre, email, password) VALUES(?, ?, ?)",
    [nombre, email, hash],
    function (err) {
      if (err) {
        // Si email duplicado
        if (err.message && err.message.includes("UNIQUE")) {
          return res.json({ success: false, message: "Ese correo ya está registrado" });
        }
        return res.json({ success: false, message: "Error base datos" });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ----------------- Login -----------------
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ success: false, message: "Faltan datos" });

  db.get("SELECT id, nombre, email, password FROM miembros WHERE email = ?", [email], (err, row) => {
    if (err) return res.json({ success: false, message: "Error BD" });
    if (!row) return res.json({ success: false, message: "Usuario no encontrado" });

    const match = bcrypt.compareSync(password, row.password);
    if (!match) return res.json({ success: false, message: "Contraseña incorrecta" });

    // Login ok -> devolvemos id y nombre
    res.json({ success: true, id: row.id, nombre: row.nombre });
  });
});

// ----------------- Buscar usuario por nombre (opcional) -----------------
app.get("/api/buscar-usuario/:nombre", (req, res) => {
  const nombre = req.params.nombre;
  db.get("SELECT id, nombre FROM miembros WHERE nombre = ?", [nombre], (err, row) => {
    if (err) return res.json({ exists: false });
    if (!row) return res.json({ exists: false });
    res.json({ exists: true, id: row.id, nombre: row.nombre });
  });
});

// ----------------- Publicar -----------------
app.post("/api/publicar", (req, res) => {
  const { usuario_id, contenido } = req.body;
  if (!usuario_id || !contenido) return res.json({ success: false });

  db.run(
    "INSERT INTO publicaciones(usuario_id, contenido, fecha) VALUES(?, ?, datetime('now'))",
    [usuario_id, contenido],
    function (err) {
      if (err) return res.json({ success: false });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ----------------- Obtener publicaciones -----------------
app.get("/api/publicaciones", (req, res) => {
  db.all(
    `SELECT publicaciones.id, contenido, fecha, miembros.nombre
     FROM publicaciones
     JOIN miembros ON publicaciones.usuario_id = miembros.id
     ORDER BY publicaciones.id DESC`,
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

// ----------------- Comentar -----------------
app.post("/api/comentar", (req, res) => {
  const { usuario_id, publicacion_id, comentario } = req.body;
  if (!usuario_id || !publicacion_id || !comentario) return res.json({ success: false });

  db.run(
    "INSERT INTO comentarios(usuario_id, publicacion_id, comentario, fecha) VALUES(?, ?, ?, datetime('now'))",
    [usuario_id, publicacion_id, comentario],
    function (err) {
      if (err) return res.json({ success: false });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// ----------------- Obtener comentarios por publicación -----------------
app.get("/api/comentarios/:id", (req, res) => {
  const publicacionID = req.params.id;
  db.all(
    `SELECT comentarios.id, comentario, fecha, miembros.nombre
     FROM comentarios
     JOIN miembros ON comentarios.usuario_id = miembros.id
     WHERE publicacion_id = ?
     ORDER BY comentarios.id DESC`,
    [publicacionID],
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

// ----------------- Comentarios sobre mi -----------------
app.post("/api/comentario-sobre-mi", (req, res) => {
  const { usuario_id, comentario } = req.body;
  if (!usuario_id || !comentario) return res.json({ success: false });

  db.run(
    "INSERT INTO comentarios_sobre_mi(usuario_id, comentario, fecha) VALUES(?, ?, datetime('now'))",
    [usuario_id, comentario],
    function (err) {
      if (err) return res.json({ success: false });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get("/api/comentarios-sobre-mi", (req, res) => {
  db.all(
    `SELECT comentarios_sobre_mi.id, comentario, fecha, miembros.nombre 
     FROM comentarios_sobre_mi
     JOIN miembros ON comentarios_sobre_mi.usuario_id = miembros.id
     ORDER BY comentarios_sobre_mi.id DESC`,
    (err, rows) => {
      if (err) return res.json([]);
      res.json(rows);
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
