const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const db = require('./db.js'); 
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const SECRET = process.env.JWT_SECRET || 'secretkey';

app.use(cors());
app.use(express.json());
app.use(express.static('client'));

let messages = [];
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  ws.send(JSON.stringify({ type: 'init', data: messages }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'chat') {
        messages.push(parsed.data);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'chat', data: parsed.data }));
          }
        });
      }
    } catch (err) {
      console.error('WebSocket message error:', err.message);
    }
  });
});

function authAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'admin') return res.sendStatus(403);
    req.user = decoded;
    next();
  } catch {
    res.sendStatus(403);
  }
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/projects', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM projects ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/projects', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    const [result] = await db.query(
      'INSERT INTO projects (name) VALUES (?)',
      [name]
    );
    res.json({ id: result.insertId, name });
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.get('/tasks/:projectId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM tasks WHERE project_id = ? ORDER BY id DESC',
      [req.params.projectId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/tasks', authAdmin, async (req, res) => {
  const { project_id, title, status, start_date, deadline } = req.body;
  console.log("Incoming Task:", { project_id, title, status, start_date, deadline });

  if (!project_id || !title || !status || !start_date || !deadline) {
    return res.status(400).json({ error: 'Missing required task fields' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO tasks (project_id, title, status, deadline, start_date) VALUES (?, ?, ?, ?, ?)',
      [project_id, title, status, deadline, start_date]
    );
    res.json({ id: result.insertId, project_id, title, status, start_date, deadline });
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/client/index.html');
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));