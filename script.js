class HorseCareApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userData = null;
        this.horses = [];
        this.init();
    }

    init() {
        this.tg.expand();
        this.tg.enableClosingConfirmation();
        this.loadUserData();
    }

    async loadUserData() {
        try {
            this.showLoading();
            
            const data = {
                action: 'get_user_data',
                timestamp: Date.now()
            };
            
            this.tg.sendData(JSON.stringify(data));
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Ошибка загрузки данных. Убедитесь, что вы открыли приложение через бота.');
        }
    }

    processMessage(text) {
    try {
        console.log("Received message:", text);
        
        if (text.startsWith('Данные для веб-приложения: ')) {
            const jsonStr = text.replace('Данные для веб-приложения: ', '');
            console.log("JSON string:", jsonStr);
            
            // Проверяем валидность JSON
            try {
                const data = JSON.parse(jsonStr);
                this.displayData(data);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                
                // Попробуем починить JSON (убрать лишние символы)
                const cleanedJson = jsonStr
                    .replace(/,\s*}/g, '}')  // Убираем запятые перед }
                    .replace(/,\s*]/g, ']')  // Убираем запятые перед ]
                    .replace(/;\s*/g, ',')   // Заменяем точки с запятой на запятые
                    .replace(/"\s*}/g, '"}') // Убираем пробелы перед }
                    .replace(/"\s*]/g, '"]') // Убираем пробелы перед ]
                    .replace(/\\"/g, '"')    // Убираем экранированные кавычки
                    .replace(/\s+/g, ' ');   // Убираем лишние пробелы
                
                console.log("Cleaned JSON:", cleanedJson);
                
                try {
                    const data = JSON.parse(cleanedJson);
                    this.displayData(data);
                } catch (secondError) {
                    this.showError('Ошибка парсинга JSON: ' + secondError.message);
                }
            }
        }
    } catch (error) {
        console.error('Error processing message:', error);
        this.showError('Ошибка обработки данных: ' + error.message);
    }
}

    displayData(data) {
        try {
            document.getElementById('loading').style.display = 'none';
            
            if (data && data.user) {
                this.userData = data.user;
                this.horses = data.horses || [];
                this.displayUserInfo();
                this.displayHorses();
            } else {
                this.showError('Неверный формат данных');
            }
        } catch (error) {
            console.error('Error displaying data:', error);
            this.showError('Ошибка отображения данных');
        }
    }

    displayUserInfo() {
        if (!this.userData) return;

        const userDetails = document.getElementById('userDetails');
        const userInfo = document.getElementById('userInfo');
        
        if (userDetails && userInfo) {
            userDetails.innerHTML = `
                <p><strong>Имя:</strong> ${this.userData.username || 'Не указано'}</p>
                <p><strong>Пол:</strong> ${this.userData.gender === 'муж' ? 'Мужской' : 'Женский'}</p>
                <p><strong>Чибик:</strong> ${this.userData.chibik_name}</p>
            `;
            userInfo.style.display = 'block';
        }
    }

    displayHorses() {
        const container = document.getElementById('horsesList');
        
        if (!this.horses || this.horses.length === 0) {
            container.innerHTML = this.getNoHorsesHTML();
            return;
        }

        container.innerHTML = this.horses.map(horse => this.getHorseHTML(horse)).join('');
    }

    getNoHorsesHTML() {
        return `
            <div class="no-horses">
                <h3>🐎 У вас пока нет коней</h3>
                <p>Добавьте первого коня через меню бота!</p>
            </div>
        `;
    }

    getHorseHTML(horse) {
        const lastUpdated = horse.last_updated ? 
            new Date(horse.last_updated).toLocaleDateString('ru-RU') : 
            'Неизвестно';

        return `
            <div class="horse-card">
                ${horse.photo ? `<img src="${horse.photo}" alt="${horse.name}" class="horse-photo">` : ''}
                
                <div class="horse-name">${horse.name}</div>
                <div class="horse-number">№${horse.number}</div>
                
                <div class="stats">
                    <div class="stat">
                        <div>🍗 Корм</div>
                        <div class="stat-number">${horse.feed_level}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill feed-fill" style="width: ${horse.feed_level}%"></div>
                        </div>
                    </div>
                    
                    <div class="stat">
                        <div>💧 Вода</div>
                        <div class="stat-number">${horse.water_level}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill water-fill" style="width: ${horse.water_level}%"></div>
                        </div>
                    </div>
                    
                    <div class="stat">
                        <div>🌱 Цветы</div>
                        <div class="stat-number">${horse.flower_level}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill flower-fill" style="width: ${horse.flower_level}%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="last-updated">Обновлено: ${lastUpdated}</div>
                
                <div class="actions">
                    <button class="btn btn-feed" onclick="app.feedHorse(${horse.id})">🍗 +10</button>
                    <button class="btn btn-water" onclick="app.waterHorse(${horse.id})">💧 +10</button>
                    <button class="btn btn-flowers" onclick="app.flowerHorse(${horse.id})">🌱 +5</button>
                    <button class="btn btn-delete" onclick="app.deleteHorse(${horse.id})">🗑️ Удалить</button>
                </div>
            </div>
        `;
    }

    async feedHorse(horseId) {
        await this.updateHorseStats(horseId, { feed: 10 }, 'Конь покормлен!');
    }

    async waterHorse(horseId) {
        await this.updateHorseStats(horseId, { water: 10 }, 'Конь напоен!');
    }

    async flowerHorse(horseId) {
        await this.updateHorseStats(horseId, { flowers: 5 }, 'Цветы политы!');
    }

    async updateHorseStats(horseId, stats, successMessage) {
        try {
            const data = {
                action: 'update_horse_stats',
                horse_id: horseId,
                ...stats
            };
            
            this.tg.sendData(JSON.stringify(data));
            this.showNotification(successMessage);
            
            // Обновляем данные через секунду
            setTimeout(() => this.loadUserData(), 1000);
            
        } catch (error) {
            console.error('Error updating stats:', error);
            this.showError('Ошибка обновления');
        }
    }

    async deleteHorse(horseId) {
        if (confirm('Вы уверены, что хотите удалить этого коня?')) {
            try {
                const data = {
                    action: 'delete_horse_request',
                    horse_id: horseId
                };
                
                this.tg.sendData(JSON.stringify(data));
                this.showNotification('Заявка на удаление отправлена администратору!');
                
                setTimeout(() => this.loadUserData(), 1000);
                
            } catch (error) {
                console.error('Error deleting horse:', error);
                this.showError('Ошибка отправки заявки');
            }
        }
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';
        document.getElementById('horsesList').innerHTML = '';
        document.getElementById('userInfo').style.display = 'none';
    }

    showError(message) {
        const errorEl = document.getElementById('error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    }

    showNotification(message) {
        // В реальном приложении лучше использовать toast уведомления
        alert(message);
    }
}

// Инициализация приложения
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new HorseCareApp();
});

// Глобальная функция для обработки сообщений от бота
window.handleBotMessage = function(text) {
    if (app) {
        app.processMessage(text);
    }
};
