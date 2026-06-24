const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'pentaract',
    host: process.env.POSTGRES_HOST || process.env.DATABASE_HOST || 'db',
    database: process.env.POSTGRES_DB || 'pentaract',
    password: process.env.POSTGRES_PASSWORD || 'pentaract',
    port: process.env.POSTGRES_PORT || process.env.DATABASE_PORT || 5432,
});

const initDb = async (retries = 5) => {
    while (retries > 0) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_users (
                    id SERIAL PRIMARY KEY,
                    first_name VARCHAR(255),
                    last_name VARCHAR(255),
                    country VARCHAR(255),
                    dob VARCHAR(255),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_verified BOOLEAN DEFAULT false,
                    storage_quota BIGINT DEFAULT 5368709120,
                    storage_used BIGINT DEFAULT 0,
                    reset_token TEXT,
                    reset_token_expires TIMESTAMP
                )
            `);
            
            // Add new columns to existing table
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS phone VARCHAR(255)`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS profile_photo TEXT`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS encrypted_master_key TEXT`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS escrowed_master_key TEXT`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS hidden_password_hash VARCHAR(255)`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free'`);
            await pool.query(`ALTER TABLE mc_users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP`);
            
            console.log('Users table ready.');

            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_folders (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    parent_id INTEGER DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES mc_users (id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_id) REFERENCES mc_folders (id) ON DELETE CASCADE
                )
            `);
            console.log('Folders table ready.');

            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_files (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mimetype TEXT,
                    size BIGINT,
                    is_favorite BOOLEAN DEFAULT false,
                    folder_id INTEGER DEFAULT NULL,
                    is_deleted BOOLEAN DEFAULT false,
                    deleted_at TIMESTAMP,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    iv TEXT,
                    data_shards INTEGER DEFAULT 1,
                    parity_shards INTEGER DEFAULT 0,
                    total_shards INTEGER DEFAULT 1,
                    thumbnail_base64 TEXT,
                    FOREIGN KEY (user_id) REFERENCES mc_users (id) ON DELETE CASCADE,
                    FOREIGN KEY (folder_id) REFERENCES mc_folders (id) ON DELETE SET NULL
                )
            `);
            console.log('Files table ready.');

            // Add new columns to existing files table
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS folder_id INTEGER DEFAULT NULL`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS iv TEXT`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS salt TEXT`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS total_shards INTEGER DEFAULT 1`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS data_shards INTEGER DEFAULT 1`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS parity_shards INTEGER DEFAULT 0`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS ai_tags TEXT`);
            await pool.query(`ALTER TABLE mc_files ADD COLUMN IF NOT EXISTS ai_summary TEXT`);
            
            // We can't easily add a foreign key constraint to an existing table if it might fail, 
            // but we can try (it might fail if it already exists, so we catch it).
            try {
                await pool.query(`ALTER TABLE mc_files ADD CONSTRAINT fk_folder FOREIGN KEY (folder_id) REFERENCES mc_folders (id) ON DELETE SET NULL`);
            } catch (e) {
                // Ignore if constraint already exists
            }


            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_photos (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    original_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mimetype TEXT,
                    size BIGINT,
                    is_favorite BOOLEAN DEFAULT false,
                    is_hidden BOOLEAN DEFAULT false,
                    is_deleted BOOLEAN DEFAULT false,
                    deleted_at TIMESTAMP,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    thumbnail_base64 TEXT,
                    FOREIGN KEY (user_id) REFERENCES mc_users (id) ON DELETE CASCADE
                )
            `);
            console.log('Photos table ready.');
            
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS iv TEXT`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS salt TEXT`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS total_shards INTEGER DEFAULT 1`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS data_shards INTEGER DEFAULT 1`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS parity_shards INTEGER DEFAULT 0`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS ai_tags TEXT`);
            await pool.query(`ALTER TABLE mc_photos ADD COLUMN IF NOT EXISTS ai_summary TEXT`);


            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_albums (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES mc_users (id) ON DELETE CASCADE
                )
            `);
            
            await pool.query(`
                CREATE TABLE IF NOT EXISTS mc_album_photos (
                    album_id INTEGER NOT NULL,
                    photo_id INTEGER NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (album_id, photo_id),
                    FOREIGN KEY (album_id) REFERENCES mc_albums (id) ON DELETE CASCADE,
                    FOREIGN KEY (photo_id) REFERENCES mc_photos (id) ON DELETE CASCADE
                )
            `);
            console.log('Albums tables ready.');

            // Add Indexes
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_files_user_id ON mc_files (user_id)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_photos_user_id ON mc_photos (user_id)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_files_filename ON mc_files (filename)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_mc_photos_filename ON mc_photos (filename)`);
            console.log('Database indexes ready.');

            return; // Success
        } catch (err) {
            console.error(`Error initializing database, retries left: ${retries - 1}`, err.message);
            retries -= 1;
            await new Promise(res => setTimeout(res, 5000)); // wait 5 seconds before retrying
        }
    }
    console.error('Failed to initialize database after multiple attempts.');
};

initDb();

module.exports = {
    query: (text, params) => pool.query(text, params),
};
