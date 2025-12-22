# Trader Crash 📈

A real-time multiplayer betting game inspired by the "Crash" mechanic (like Aviator), built with a financial trading theme.

## 🚀 Features

- **Real-time Communication:** Built with Socket.io for instant game state synchronization across all connected clients.
- **Microservices Architecture:** Separated logic for the Game Engine (`server.js`) and the Banking API (`cassino.js`).
- **Responsive Design:** Mobile-first UI that adapts the HTML5 Canvas graph to any screen size.
- **Mock Banking API:** Simulates a B2B integration with a casino operator (Seamless Wallet), handling debit/credit transactions via Axios.
- **Data Persistence:** Uses a simulated database workflow for user balances.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express
- **Real-time:** Socket.io (WebSockets)
- **Frontend:** HTML5, CSS3, JavaScript (Canvas API)
- **HTTP Client:** Axios
- **Architecture:** MVC / Microservices simulation

## 🗺️ Roadmap & Future Improvements

- [ ] **Internationalization (i18n):** Implement support for multiple languages (EN/ES/PT).
- [ ] **User Authentication:** Replace simple username prompt with JWT login.
- [ ] **Production Database:** Migrate from SQLite to PostgreSQL for high concurrency.
- [ ] **Docker:** Containerize the application for easier deployment.

---
*Developed by Vinicius Lima for educational purposes.*