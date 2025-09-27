const tg = window.Telegram.WebApp;
tg.expand();

const userId = tg.initDataUnsafe.user.id;

// Пока просто покажем заглушку
document.getElementById('horses').innerHTML = `
  <p>Нажмите кнопку ниже, чтобы запросить лошадей через бота.</p>
  <button onclick="requestHorses()">Показать моих лошадей</button>
`;

function requestHorses() {
  tg.sendData(JSON.stringify({ action: "show_horses" }));
}