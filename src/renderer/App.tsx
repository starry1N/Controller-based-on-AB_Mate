import React from 'react';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="App">
      <header className="App-header">
        <h1>欢迎使用 Electron + React</h1>
        <p>这是一个现代化的桌面应用程序框架</p>
        <div className="features">
          <h2>特性：</h2>
          <ul>
            <li>⚛️ React 18</li>
            <li>🔧 Electron 27</li>
            <li>📘 TypeScript</li>
            <li>🎨 现代化 UI</li>
          </ul>
        </div>
      </header>
    </div>
  );
};

export default App;
