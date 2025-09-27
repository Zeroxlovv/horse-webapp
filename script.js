// Дополнительная логика для веб-приложения

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
        this.bindEvents();
        this.loadData();
    }

    bindEvents() {
        // Обработка изменения размера окна
        this.tg.onEvent('viewportChanged', this.handleViewportChange.bind(this));
        
        // Обработка закрытия
        this.tg.onEvent('beforeUnload', this.handleBeforeUnload.bind(this));
    }

    handleViewportChange() {
        this.tg.expand();
    }

    handleBeforeUnload() {
        // Сохранение данных перед закрытием
        this.saveState();
    }

    async loadData() {
        try {
            this.showLoading();
            
            const data = {
                action: 'get_user_data',
                timestamp: Date.now()
            };
            
            this.tg.sendData(JSON.stringify(data));
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Ошибка загрузки данных');
        }
    }

    processIncomingData(data) {
        try {
            const parsedData = JSON.parse(data);
            
            if (parsedData.user) {
                this.userData = parsedData.user;
                this.displayUserInfo();
            }
            
            if (parsedData.horses) {
                this.horses = parsedData.horses;
                this.displayHorses();
            }
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Error parsing data:', error);
            this.showError('Ошибка обработки данных');
        }
    }

    displayUserInfo() {
        if (!this.userData) return;

        const userInfoEl = document.getElementById('userInfo');
        if (userInfoEl) {
            userInfoEl.innerHTML = `
                <h3>👤 Информация о пользователе</h3>
                <p><strong>Имя:</strong> ${this.userData.username || 'Не указано'}</p>
                <p><strong>Пол:</strong> ${this.userData.gender === 'муж' ? 'Мужской' : 'Женский'}</p>
                <p><strong>Чибик:</strong> ${this.userData.chibik_name}</p>
            `;
            userInfoEl.style.display = 'block';
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
                <button class="btn btn-submit" onclick="this.tg.openTelegramLink('https://t.me/your_bot_username')">
                    📱 Открыть бота
                </button>
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
            this.showSuccess(successMessage);
            
            // Обновляем данные через секунду
            setTimeout(() => this.loadData(), 1000);
            
        } catch (error) {
            console.error('Error updating stats:', error);
            this.showError('Ошибка обновления');
        }
    }

    async deleteHorse(horseId) {
        this.tg.showConfirm('Вы уверены, что хотите удалить этого коня?', (confirmed) => {
            if (confirmed) {
                const data = {
                    action: 'delete_horse_request',
                    horse_id: horseId
                };
                
                this.tg.sendData(JSON.stringify(data));
                this.showSuccess('Заявка на удаление отправлена администратору');
                
                setTimeout(() => this.loadData(), 1000);
            }
        });
    }

    showLoading() {
        const container = document.getElementById('horsesList');
        container.innerHTML = '<div class="loading">Загрузка данных...</div>';
    }

    hideLoading() {
        // Автоматически скрывается при отображении данных
    }

    showSuccess(message) {
        this.tg.showPopup({
            title: 'Успех!',
            message: message,
            buttons: [{ type: 'ok' }]
        });
    }

    showError(message) {
        this.tg.showPopup({
            title: 'Ошибка',
            message: message,
            buttons: [{ type: 'ok' }]
        });
    }

    saveState() {
        // Сохранение состояния в localStorage
        const state = {
            userData: this.userData,
            horses: this.horses,
            timestamp: Date.now()
        };
        localStorage.setItem('horseCareState', JSON.stringify(state));
    }

    loadState() {
        // Загрузка состояния из localStorage
        const saved = localStorage.getItem('horseCareState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                // Используем сохраненные данные только если им меньше 5 минут
                if (Date.now() - state.timestamp < 5 * 60 * 1000) {
                    this.userData = state.userData;
                    this.horses = state.horses;
                    this.displayUserInfo();
                    this.displayHorses();
                }
            } catch (error) {
                console.error('Error loading saved state:', error);
            }
        }
    }
}

// Инициализация приложения
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new HorseCareApp();
    app.loadState(); // Загружаем сохраненное состояние
});

// Глобальная функция для обработки данных от бота
window.handleTelegramData = function(data) {
    if (app) {
        app.processIncomingData(data);
    }
};