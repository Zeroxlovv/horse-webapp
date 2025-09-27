class HorseCareApp {
    constructor() {
        this.tg = window.Telegram.WebApp;
        this.userData = null;
        this.horses = [];
        this.init();
    }

    init() {
        console.log("Инициализация приложения...");
        this.tg.expand();
        this.tg.enableClosingConfirmation();
        
        // Проверяем, открыто ли приложение через Telegram
        if (this.tg.initDataUnsafe.user) {
            console.log("Приложение открыто через Telegram");
            this.loadUserData();
        } else {
            console.log("Приложение открыто в браузере, а не через Telegram");
            this.showError("Откройте приложение через Telegram бота для работы с данными");
        }
    }

    async loadUserData() {
        try {
            this.showLoading();
            console.log("Запрос данных у бота...");
            
            const data = {
                action: 'get_user_data',
                timestamp: Date.now()
            };
            
            // Отправляем запрос боту
            this.tg.sendData(JSON.stringify(data));
            console.log("Данные отправлены боту");
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.showError('Ошибка загрузки данных: ' + error.message);
        }
    }

    // Эта функция будет вызываться когда бот ответит
    processBotResponse(text) {
        try {
            console.log("Получен ответ от бота:", text);
            
            if (text && text.startsWith('Данные для веб-приложения: ')) {
                const jsonStr = text.replace('Данные для веб-приложения: ', '');
                console.log("JSON данные:", jsonStr);
                
                const data = JSON.parse(jsonStr);
                this.displayData(data);
            } else {
                this.showError("Неверный формат ответа от бота");
            }
        } catch (error) {
            console.error('Ошибка обработки данных:', error);
            this.showError('Ошибка обработки данных: ' + error.message);
        }
    }

    displayData(data) {
        try {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            
            console.log("Отображение данных:", data);
            
            if (data && data.user) {
                this.userData = data.user;
                this.horses = data.horses || [];
                this.displayUserInfo();
                this.displayHorses();
            } else {
                this.showError('Неверный формат данных');
            }
        } catch (error) {
            console.error('Ошибка отображения данных:', error);
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
        const feedLevel = parseInt(horse.feed_level) || 0;
        const waterLevel = parseInt(horse.water_level) || 0;
        const flowerLevel = parseInt(horse.flower_level) || 0;

        return `
            <div class="horse-card">
                ${horse.photo ? `<img src="${horse.photo}" alt="${horse.name}" class="horse-photo">` : ''}
                
                <div class="horse-name">${horse.name}</div>
                <div class="horse-number">№${horse.number}</div>
                
                <div class="stats">
                    <div class="stat">
                        <div>🍗 Корм</div>
                        <div class="stat-number">${feedLevel}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill feed-fill" style="width: ${feedLevel}%"></div>
                        </div>
                    </div>
                    
                    <div class="stat">
                        <div>💧 Вода</div>
                        <div class="stat-number">${waterLevel}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill water-fill" style="width: ${waterLevel}%"></div>
                        </div>
                    </div>
                    
                    <div class="stat">
                        <div>🌱 Цветы</div>
                        <div class="stat-number">${flowerLevel}%</div>
                        <div class="stat-bar">
                            <div class="stat-fill flower-fill" style="width: ${flowerLevel}%"></div>
                        </div>
                    </div>
                </div>
                
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
            
            // Обновляем данные через 2 секунды
            setTimeout(() => this.loadUserData(), 2000);
            
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
                
                setTimeout(() => this.loadUserData(), 2000);
                
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
        alert(message);
    }
}

// Глобальные функции
let app;

function loadUserData() {
    if (app) {
        app.loadUserData();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    app = new HorseCareApp();
});

// Функция для обработки сообщений от бота (если нужно)
window.handleBotMessage = function(text) {
    if (app) {
        app.processBotResponse(text);
    }
};
