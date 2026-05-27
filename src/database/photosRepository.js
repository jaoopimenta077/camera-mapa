import * as SQLite from 'expo-sqlite';

let databasePromise;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('gallery-map.db');
  }

  return databasePromise;
}

export async function initDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_uri TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL
    );
  `);
}

export async function findAllPhotos() {
  const db = await getDatabase();

  return db.getAllAsync(
    'SELECT id, title, image_uri, latitude, longitude, created_at FROM photos ORDER BY datetime(created_at) DESC;'
  );
}

export async function insertPhoto({ title, imageUri, latitude, longitude }) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO photos (title, image_uri, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?);`,
    [title, imageUri, latitude, longitude, new Date().toISOString()]
  );
}

export async function deletePhoto(id) {
  const db = await getDatabase();

  await db.runAsync('DELETE FROM photos WHERE id = ?;', [id]);
}
