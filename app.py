from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import sqlite3
import datetime
from contextlib import contextmanager
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-in-production'
app.config['DATABASE'] = 'database.db'

# Константы из бота
MAIN_ADMIN_IDS = [822322033, 2100505936]
DECREASE_INTERVAL_HOURS = 2
FEED_DECREASE = 5
WATER_DECREASE = 7
FLOWER_DECREASE = 3

@contextmanager
def get_db_connection():
    conn = sqlite3.connect(app.config['DATABASE'])
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_database():
    """Полная инициализация базы данных (создание всех таблиц)"""
    with get_db_connection() as conn:
        cur = conn.cursor()
        
        # Таблица пользователей
        cur.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            gender TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # Таблица чибиков
        cur.execute('''CREATE TABLE IF NOT EXISTS chibiks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            name TEXT)''')
        
        # Таблица лошадей
        cur.execute('''CREATE TABLE IF NOT EXISTS horses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            name TEXT,
            number TEXT UNIQUE,
            photo TEXT,
            feed_level INTEGER DEFAULT 100,
            water_level INTEGER DEFAULT 100,
            flower_level INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_decrease TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # Таблица заявок на привязку
        cur.execute('''CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            horse_name TEXT,
            horse_number TEXT,
            proof_photo TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # Таблица администраторов
        cur.execute('''CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            added_by INTEGER,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # Таблица заявок на удаление коней
        cur.execute('''CREATE TABLE IF NOT EXISTS delete_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            horse_id INTEGER REFERENCES horses(id),
            horse_name TEXT,
            horse_number TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        
        # Добавляем столбец для пароля веб-доступа
        try:
            cur.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        except sqlite3.OperationalError:
            pass  # Колонка уже существует
        
        # Добавляем главных админов если их нет
        for admin_id in MAIN_ADMIN_IDS:
            cur.execute('''INSERT OR IGNORE INTO admins (telegram_id, username, added_by) 
                           VALUES (?, ?, ?)''', 
                       (admin_id, 'Главный администратор', 0))
        
        conn.commit()
        print("✅ База данных инициализирована")

def get_user_by_telegram_id(telegram_id):
    with get_db_connection() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE telegram_id = ?", 
            (telegram_id,)
        ).fetchone()
        return user

def update_user_password(telegram_id, password_hash):
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE telegram_id = ?",
            (password_hash, telegram_id)
        )
        conn.commit()

def check_registration(telegram_id):
    with get_db_connection() as conn:
        user = conn.execute(
            "SELECT id FROM users WHERE telegram_id = ?", 
            (telegram_id,)
        ).fetchone()
        return user is not None

def get_user_horses(telegram_id):
    with get_db_connection() as conn:
        horses = conn.execute('''
            SELECT h.id, h.name, h.number, h.feed_level, h.water_level, 
                   h.flower_level, h.photo, h.last_updated
            FROM horses h 
            JOIN users u ON h.user_id = u.id 
            WHERE u.telegram_id = ?
        ''', (telegram_id,)).fetchall()
        return horses

def get_horse_data(horse_id):
    with get_db_connection() as conn:
        horse = conn.execute(
            "SELECT * FROM horses WHERE id = ?", 
            (horse_id,)
        ).fetchone()
        return horse

def update_horse_stat(horse_id, stat_type, value):
    with get_db_connection() as conn:
        conn.execute(
            f"UPDATE horses SET {stat_type} = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
            (value, horse_id)
        )
        conn.commit()

def decrease_horse_stats(horse_id):
    with get_db_connection() as conn:
        horse = conn.execute(
            "SELECT * FROM horses WHERE id = ?", 
            (horse_id,)
        ).fetchone()
        
        if not horse:
            return {'decreased': False}
        
        last_decrease_str = horse['last_decrease']
        if not last_decrease_str:
            return {'decreased': False}
            
        last_decrease = datetime.datetime.fromisoformat(last_decrease_str)
        now = datetime.datetime.now()
        hours_passed = (now - last_decrease).total_seconds() / 3600
        
        if hours_passed >= DECREASE_INTERVAL_HOURS:
            decrease_count = int(hours_passed // DECREASE_INTERVAL_HOURS)
            
            feed_level = horse['feed_level'] if horse['feed_level'] is not None else 0
            water_level = horse['water_level'] if horse['water_level'] is not None else 0
            flower_level = horse['flower_level'] if horse['flower_level'] is not None else 0
            
            new_feed = max(0, feed_level - (FEED_DECREASE * decrease_count))
            new_water = max(0, water_level - (WATER_DECREASE * decrease_count))
            new_flower = max(0, flower_level - (FLOWER_DECREASE * decrease_count))
            
            conn.execute('''UPDATE horses 
                           SET feed_level = ?, water_level = ?, flower_level = ?, 
                               last_decrease = ?, last_updated = CURRENT_TIMESTAMP 
                           WHERE id = ?''',
                        (new_feed, new_water, new_flower, now, horse_id))
            conn.commit()
            
            return {
                'decreased': True,
                'feed_decrease': feed_level - new_feed,
                'water_decrease': water_level - new_water,
                'flower_decrease': flower_level - new_flower,
                'hours_passed': hours_passed
            }
        
        return {'decreased': False}

# Админские функции
def is_main_admin(telegram_id):
    return telegram_id in MAIN_ADMIN_IDS

def is_admin(telegram_id):
    with get_db_connection() as conn:
        admin = conn.execute(
            "SELECT id FROM admins WHERE telegram_id = ?", 
            (telegram_id,)
        ).fetchone()
        return admin is not None or is_main_admin(telegram_id)

def get_pending_requests():
    with get_db_connection() as conn:
        requests = conn.execute('''
            SELECT r.*, u.username, u.telegram_id 
            FROM requests r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.status = 'pending'
        ''').fetchall()
        return requests

def get_pending_requests_count():
    with get_db_connection() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM requests WHERE status = 'pending'"
        ).fetchone()[0]
        return count

def get_pending_delete_requests():
    with get_db_connection() as conn:
        requests = conn.execute('''
            SELECT dr.*, u.username, u.telegram_id 
            FROM delete_requests dr 
            JOIN users u ON dr.user_id = u.id 
            WHERE dr.status = 'pending'
        ''').fetchall()
        return requests

def get_pending_delete_requests_count():
    with get_db_connection() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM delete_requests WHERE status = 'pending'"
        ).fetchone()[0]
        return count

def get_admins_count():
    with get_db_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
        return count

def get_total_horses_count():
    with get_db_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM horses").fetchone()[0]
        return count

def approve_horse_request(request_id):
    with get_db_connection() as conn:
        req = conn.execute('''
            SELECT r.*, u.id as user_db_id 
            FROM requests r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.id = ?
        ''', (request_id,)).fetchone()
        
        if not req:
            return None
        
        conn.execute('''
            INSERT INTO horses (user_id, name, number, photo) 
            VALUES (?, ?, ?, ?)
        ''', (req['user_db_id'], req['horse_name'], req['horse_number'], req['proof_photo']))
        
        conn.execute("UPDATE requests SET status = 'approved' WHERE id = ?", (request_id,))
        conn.commit()
        return req

def reject_horse_request(request_id):
    with get_db_connection() as conn:
        conn.execute("UPDATE requests SET status = 'rejected' WHERE id = ?", (request_id,))
        conn.commit()

def approve_delete_request(request_id):
    with get_db_connection() as conn:
        req = conn.execute('''
            SELECT dr.*, u.telegram_id as user_telegram_id 
            FROM delete_requests dr 
            JOIN users u ON dr.user_id = u.id 
            WHERE dr.id = ?
        ''', (request_id,)).fetchone()
        
        if not req:
            return None
        
        conn.execute("DELETE FROM horses WHERE id = ?", (req['horse_id'],))
        conn.execute("UPDATE delete_requests SET status = 'approved' WHERE id = ?", (request_id,))
        conn.commit()
        return req

def reject_delete_request(request_id):
    with get_db_connection() as conn:
        conn.execute("UPDATE delete_requests SET status = 'rejected' WHERE id = ?", (request_id,))
        conn.commit()

def get_all_admins():
    with get_db_connection() as conn:
        admins = conn.execute('''
            SELECT a.telegram_id, a.username, a.added_at, u.username as added_by_username 
            FROM admins a 
            LEFT JOIN admins u ON a.added_by = u.telegram_id 
            ORDER BY a.added_at
        ''').fetchall()
        return admins

def add_admin(telegram_id, username, added_by):
    with get_db_connection() as conn:
        conn.execute('''
            INSERT OR REPLACE INTO admins (telegram_id, username, added_by) 
            VALUES (?, ?, ?)
        ''', (telegram_id, username, added_by))
        conn.commit()
        return True

def remove_admin(telegram_id):
    if is_main_admin(telegram_id):
        return False
    
    with get_db_connection() as conn:
        conn.execute("DELETE FROM admins WHERE telegram_id = ?", (telegram_id,))
        conn.commit()
        return True

# Маршруты Flask
@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('horses'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        telegram_id = request.form.get('telegram_id')
        password = request.form.get('password')
        
        try:
            telegram_id = int(telegram_id)
        except ValueError:
            flash('Telegram ID должен быть числом', 'error')
            return render_template('login.html')
        
        user = get_user_by_telegram_id(telegram_id)
        
        if user and user['password_hash'] and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['telegram_id']
            session['username'] = user['username']
            session['is_admin'] = is_admin(telegram_id)
            flash('Успешный вход!', 'success')
            return redirect(url_for('horses'))
        else:
            flash('Неверный Telegram ID или пароль', 'error')
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        telegram_id = request.form.get('telegram_id')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        try:
            telegram_id = int(telegram_id)
        except ValueError:
            flash('Telegram ID должен быть числом', 'error')
            return render_template('register.html')
        
        if password != confirm_password:
            flash('Пароли не совпадают', 'error')
            return render_template('register.html')
        
        user = get_user_by_telegram_id(telegram_id)
        if not user:
            # Создаем нового пользователя если не существует
            with get_db_connection() as conn:
                conn.execute(
                    "INSERT INTO users (telegram_id, username) VALUES (?, ?)",
                    (telegram_id, f"user_{telegram_id}")
                )
                conn.commit()
            user = get_user_by_telegram_id(telegram_id)
        
        if user and user['password_hash']:
            flash('Аккаунт уже зарегистрирован', 'error')
            return render_template('register.html')
        
        password_hash = generate_password_hash(password)
        update_user_password(telegram_id, password_hash)
        
        flash('Регистрация успешна! Теперь вы можете войти.', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/horses')
def horses():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    horses_list = get_user_horses(session['user_id'])
    
    for horse in horses_list:
        decrease_horse_stats(horse['id'])
    
    horses_list = get_user_horses(session['user_id'])
    
    return render_template('horses.html', horses=horses_list)

@app.route('/horse/<int:horse_id>')
def horse_detail(horse_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    horse = get_horse_data(horse_id)
    if not horse:
        flash('Конь не найден', 'error')
        return redirect(url_for('horses'))
    
    user_horses = get_user_horses(session['user_id'])
    user_horse_ids = [h['id'] for h in user_horses]
    
    if horse_id not in user_horse_ids:
        flash('У вас нет доступа к этому коню', 'error')
        return redirect(url_for('horses'))
    
    decrease_result = decrease_horse_stats(horse_id)
    horse = get_horse_data(horse_id)
    
    return render_template('horse_detail.html', horse=horse, decrease_result=decrease_result)

@app.route('/api/horse/<int:horse_id>/feed', methods=['POST'])
def feed_horse(horse_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    horse = get_horse_data(horse_id)
    if not horse:
        return jsonify({'error': 'Конь не найден'}), 404
    
    decrease_horse_stats(horse_id)
    horse_data = get_horse_data(horse_id)
    
    current_feed = horse_data['feed_level'] if horse_data['feed_level'] is not None else 0
    new_feed = min(100, current_feed + 10)
    update_horse_stat(horse_id, "feed_level", new_feed)
    
    return jsonify({'success': True, 'new_feed': new_feed})

@app.route('/api/horse/<int:horse_id>/water', methods=['POST'])
def water_horse(horse_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    horse = get_horse_data(horse_id)
    if not horse:
        return jsonify({'error': 'Конь не найден'}), 404
    
    decrease_horse_stats(horse_id)
    horse_data = get_horse_data(horse_id)
    
    current_water = horse_data['water_level'] if horse_data['water_level'] is not None else 0
    new_water = min(100, current_water + 10)
    update_horse_stat(horse_id, "water_level", new_water)
    
    return jsonify({'success': True, 'new_water': new_water})

@app.route('/api/horse/<int:horse_id>/flower', methods=['POST'])
def flower_horse(horse_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    horse = get_horse_data(horse_id)
    if not horse:
        return jsonify({'error': 'Конь не найден'}), 404
    
    decrease_horse_stats(horse_id)
    horse_data = get_horse_data(horse_id)
    
    current_flower = horse_data['flower_level'] if horse_data['flower_level'] is not None else 0
    new_flower = min(100, current_flower + 5)
    update_horse_stat(horse_id, "flower_level", new_flower)
    
    return jsonify({'success': True, 'new_flower': new_flower})

@app.route('/profile')
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    user = get_user_by_telegram_id(session['user_id'])
    horses = get_user_horses(session['user_id'])
    
    return render_template('profile.html', user=user, horses=horses)

@app.route('/admin')
def admin_panel():
    if 'user_id' not in session or not session.get('is_admin'):
        flash('Доступ запрещен!', 'error')
        return redirect(url_for('index'))
    
    # Получаем статистику для админ-панели
    stats = {
        'pending_requests_count': get_pending_requests_count(),
        'pending_delete_requests_count': get_pending_delete_requests_count(),
        'admins_count': get_admins_count(),
        'total_horses': get_total_horses_count()
    }
    
    return render_template('admin.html', **stats)

@app.route('/admin/requests')
def admin_requests():
    if 'user_id' not in session or not session.get('is_admin'):
        flash('Доступ запрещен!', 'error')
        return redirect(url_for('index'))
    
    requests = get_pending_requests()
    return render_template('admin_requests.html', requests=requests)

@app.route('/admin/delete_requests')
def admin_delete_requests():
    if 'user_id' not in session or not session.get('is_admin'):
        flash('Доступ запрещен!', 'error')
        return redirect(url_for('index'))
    
    requests = get_pending_delete_requests()
    return render_template('admin_delete_requests.html', requests=requests)

@app.route('/admin/admins')
def admin_admins():
    if 'user_id' not in session or not is_main_admin(session['user_id']):
        flash('Доступно только главным администраторам!', 'error')
        return redirect(url_for('admin_panel'))
    
    admins = get_all_admins()
    return render_template('admin_admins.html', admins=admins)

@app.route('/api/admin/approve_request/<int:request_id>', methods=['POST'])
def api_approve_request(request_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    req = approve_horse_request(request_id)
    if req:
        return jsonify({'success': True, 'message': 'Заявка одобрена'})
    else:
        return jsonify({'error': 'Заявка не найдена'}), 404

@app.route('/api/admin/reject_request/<int:request_id>', methods=['POST'])
def api_reject_request(request_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    reject_horse_request(request_id)
    return jsonify({'success': True, 'message': 'Заявка отклонена'})

@app.route('/api/admin/approve_delete_request/<int:request_id>', methods=['POST'])
def api_approve_delete_request(request_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    req = approve_delete_request(request_id)
    if req:
        return jsonify({'success': True, 'message': 'Заявка на удаление одобрена'})
    else:
        return jsonify({'error': 'Заявка не найдена'}), 404

@app.route('/api/admin/reject_delete_request/<int:request_id>', methods=['POST'])
def api_reject_delete_request(request_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    reject_delete_request(request_id)
    return jsonify({'success': True, 'message': 'Заявка на удаление отклонена'})

@app.route('/api/admin/add_admin', methods=['POST'])
def api_add_admin():
    if 'user_id' not in session or not is_main_admin(session['user_id']):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    data = request.get_json()
    telegram_id = data.get('telegram_id')
    
    if not telegram_id:
        return jsonify({'error': 'Telegram ID обязателен'}), 400
    
    try:
        telegram_id = int(telegram_id)
    except ValueError:
        return jsonify({'error': 'Telegram ID должен быть числом'}), 400
    
    if not check_registration(telegram_id):
        return jsonify({'error': 'Пользователь не зарегистрирован в боте'}), 400
    
    success = add_admin(telegram_id, f"Admin {telegram_id}", session['user_id'])
    
    if success:
        return jsonify({'success': True, 'message': 'Администратор добавлен'})
    else:
        return jsonify({'error': 'Ошибка при добавлении администратора'}), 500

@app.route('/api/admin/remove_admin/<int:telegram_id>', methods=['POST'])
def api_remove_admin(telegram_id):
    if 'user_id' not in session or not is_main_admin(session['user_id']):
        return jsonify({'error': 'Доступ запрещен'}), 403
    
    if is_main_admin(telegram_id):
        return jsonify({'error': 'Нельзя удалить главного администратора'}), 400
    
    success = remove_admin(telegram_id)
    
    if success:
        return jsonify({'success': True, 'message': 'Администратор удален'})
    else:
        return jsonify({'error': 'Ошибка при удалении администратора'}), 500

@app.route('/logout')
def logout():
    session.clear()
    flash('Вы вышли из системы', 'success')
    return redirect(url_for('index'))

if __name__ == '__main__':
    # Инициализируем базу данных при запуске
    init_database()
    app.run(debug=True, host='0.0.0.0', port=5000)