import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer';
import { marked } from 'marked'; // 需要安装: npm install marked
import './styles/Reader.css';
import { pdfjs } from 'pdfjs-dist';

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// 全局变量定义
window.currentPage = 1;
window.totalPages = 0;
window.changePage = null;

// 添加全局事件跟踪对象
window.eventTracker = window.eventTracker || {
  mouseFollowHandlers: []
};

// 自动阅读器全局对象
window.autoReader = {
  charPositions: [],
  intervalId: null,
  currentIndex: 0,
  speed: 300,
  pageContainer: null,
  isScrolling: false,
  currentPage: 1,
  isPageChanging: false,
  cleanup: null
};

// 创建统一的全局命名空间，确保在页面切换后仍然保持状态
window.rhythmReader = window.rhythmReader || {
  active: false,
  speed: 150,
  pagesRead: 0,
  intervalId: null
};

// 立即执行函数确保全局命名空间在所有代码之前初始化
(function initializeGlobalNamespace() {
  // 确保全局对象始终存在
  if (!window.rhythmReader) {
    window.rhythmReader = {
      active: false,
      speed: 150,
      pagesRead: 0,
      intervalId: null
    };
  }
  console.log("节奏阅读全局命名空间已初始化");
})();

// 节奏阅读模式 - 手动翻页安全版
(function() {
  console.log("节奏阅读模式 - 手动翻页安全版初始化");
  
  // 配置参数
  const minSpeed = 30;
  const maxSpeed = 400;
  const speedStep = 10;
  
  // 状态变量
  let charElements = [];
  let currentIndex = 0;
  let readIndices = new Set();
  
  // 安全访问全局对象的辅助函数
  const safeGetRhythmReader = function() {
    if (!window.rhythmReader) {
      console.warn("rhythmReader未初始化，重新创建");
      window.rhythmReader = {
        active: false,
        speed: 150,
        pagesRead: 0,
        intervalId: null
      };
    }
    return window.rhythmReader;
  };
  
  // 安全设置状态的辅助函数
  const safeSetActive = function(isActive) {
    const reader = safeGetRhythmReader();
    reader.active = isActive;
  };
  
  // 安全获取状态的辅助函数
  const safeGetActive = function() {
    const reader = safeGetRhythmReader();
    return reader.active;
  };
  
  // 安全操作间隔定时器的辅助函数
  const safeClearInterval = function() {
    const reader = safeGetRhythmReader();
    if (reader.intervalId) {
      clearInterval(reader.intervalId);
      reader.intervalId = null;
    }
  };
  
  const safeSetInterval = function(callback, delay) {
    const reader = safeGetRhythmReader();
    safeClearInterval();
    reader.intervalId = setInterval(callback, delay);
  };
  
  // 查找下一页按钮 - 仅用于手动翻页时的辅助
  const findNextPageButton = function() {
    const selectors = [
      '.next-page',
      '.next',
      '#next',
      '[aria-label="下一页"]',
      '[aria-label="Next"]'
    ];
    
    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (btn.offsetParent !== null) {
            return btn;
          }
        }
      } catch(e) {}
    }
    
    const allButtons = document.querySelectorAll('button, a, div[role="button"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text === '下一页' || text === 'next' || text === '>' || text === '→') {
        if (btn.offsetParent !== null) {
          return btn;
        }
      }
    }
    
      return null;
  };
  
  // 改进的清理函数
  const cleanup = function() {
    console.log("执行清理...");
    
    // 安全清理定时器
    safeClearInterval();
    
    try {
      document.querySelectorAll('.rhythm-char').forEach(span => {
        if (span.parentNode) {
          span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        }
      });
    } catch(e) {
      console.error("清理文本失败:", e);
    }
    
    charElements = [];
    currentIndex = 0;
    readIndices = new Set();
    
    // 安全设置活动状态
    safeSetActive(false);
    
    // 清理所有UI元素
    const elementsToRemove = [
      'rhythm-control-panel',
      'rhythm-speed-controller',
      'rhythm-page-complete',
      'rhythm-message'
    ];
    
    elementsToRemove.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.remove();
    });
  };
  
  // 消息显示函数
  const showMessage = function(message, duration = 3000) {
    console.log(message);
    
    // 移除旧消息
    const oldMsg = document.getElementById('rhythm-message');
    if (oldMsg) oldMsg.remove();
    
    const msgElement = document.createElement('div');
    msgElement.id = 'rhythm-message';
    msgElement.textContent = message;
    msgElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 15px 20px;
      border-radius: 5px;
      z-index: 9999999;
      font-size: 16px;
      max-width: 80%;
      text-align: center;
    `;
    
    document.body.appendChild(msgElement);
    
    setTimeout(() => {
      if (msgElement.parentNode) {
        msgElement.remove();
      }
    }, duration);
  };
  
  // 页面读完通知
  const showPageCompleteNotification = function() {
    // 移除之前的通知
    const oldNotice = document.getElementById('rhythm-page-complete');
    if (oldNotice) oldNotice.remove();
    
    // 创建通知
    const notice = document.createElement('div');
    notice.id = 'rhythm-page-complete';
    notice.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      z-index: 9999999;
      font-size: 16px;
      text-align: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    `;
    
    // 通知内容
    const message = document.createElement('div');
    message.innerHTML = '<strong>当前页面已读完</strong>';
    notice.appendChild(message);
    
    document.body.appendChild(notice);
    
    // 2秒后自动移除通知
    setTimeout(() => {
      if (notice.parentNode) {
        notice.remove();
      }
    }, 2000);
    
    // 自动尝试翻页并继续阅读
    try {
      const nextButton = findNextPageButton();
      if (nextButton) {
        // 安全增加页数
        const reader = safeGetRhythmReader();
        reader.pagesRead = (reader.pagesRead || 0) + 1;
        
        nextButton.click();
        
        // 延迟1秒后自动开始阅读新页面
        setTimeout(() => {
          startReading();
        }, 1000);
      }
    } catch (err) {
      console.error("翻页失败:", err);
    }
  };
  
  // 检查元素是否在视口中
  const isInViewport = function(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };
  
  // 更新显示
  const updateDisplay = function() {
    charElements.forEach((span, index) => {
      if (index === currentIndex) {
        span.style.color = 'green';
        span.style.fontWeight = 'bold';
      } else if (readIndices.has(index)) {
        span.style.color = '';  // 恢复正常颜色
      } else {
        span.style.color = 'rgba(200,200,200,0.3)';
      }
    });
  };
  
  // 下一个字符
  const nextChar = function() {
    // 安全检查活动状态
    if (!safeGetActive() || !charElements.length) return;
    
    readIndices.add(currentIndex);
    
    currentIndex++;
    if (currentIndex >= charElements.length) {
      // 停止当前阅读
      safeClearInterval();
      
      // 显示页面读完提示
      showPageCompleteNotification();
      return;
    }
    
    updateDisplay();
    
    // 确保当前字符可见
    const currentChar = charElements[currentIndex];
    if (currentChar && !isInViewport(currentChar)) {
      currentChar.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };
  
  // 开始阅读功能
  const startReading = function() {
    console.log("启动节奏阅读...");
    
    // 清理之前的实例
    cleanup();
    
    // 查找内容容器
    const container = document.querySelector('.pdf-content') || 
                      document.querySelector('[class*="pdf"]') || 
                      document.querySelector('article') || 
                      document.querySelector('main') || 
                      document.body;
    
    // 查找文本节点
    const textNodes = [];
    const findText = function(element) {
      for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
          textNodes.push(node);
        } else if (node.nodeType === 1 && 
                  !['SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'SELECT', 'NOSCRIPT'].includes(node.tagName)) {
          findText(node);
        }
      }
    };
    findText(container);
    
    if (textNodes.length === 0) {
      showMessage("错误: 未找到文本内容");
      return;
    }
    
    // 处理文本节点
    try {
    textNodes.forEach(node => {
        if (!node.nodeValue || !node.parentNode) return;
      
        const text = node.nodeValue;
      const fragment = document.createDocumentFragment();
      
      for (let i = 0; i < text.length; i++) {
        const span = document.createElement('span');
          span.textContent = text[i];
        span.className = 'rhythm-char';
          span.dataset.index = charElements.length;
        
        fragment.appendChild(span);
          charElements.push(span);
      }
      
        node.parentNode.replaceChild(fragment, node);
      });
    } catch(e) {
      console.error("处理文本失败:", e);
      showMessage("生成节奏阅读效果失败");
      return;
    }
    
    if (charElements.length === 0) {
      showMessage("未找到可读内容");
      return;
    }
    
    // 安全设置活动状态
    safeSetActive(true);
    currentIndex = 0;
    
    updateDisplay();
    
    // 安全设置定时器
    const reader = safeGetRhythmReader();
    safeSetInterval(nextChar, reader.speed);
    
    // 创建控制面板
    createControlPanel();
  };
  
  // 创建控制面板
  const createControlPanel = function() {
    // 检查是否已存在
    let existingPanel = document.getElementById('rhythm-speed-controller');
    if (existingPanel) existingPanel.remove();
    
    // 创建容器
    const container = document.createElement('div');
    container.id = 'rhythm-speed-controller';
    container.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(255,255,255,0.9);
      padding: 10px;
      border-radius: 5px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      font-family: Arial, sans-serif;
    `;
    
    // 标题
    const title = document.createElement('div');
    title.textContent = '节奏阅读控制';
    title.style.cssText = `
      font-weight: bold;
      margin-bottom: 8px;
      text-align: center;
    `;
    container.appendChild(title);
    
    // 安全获取速度
    const reader = safeGetRhythmReader();
    
    // 速度显示
    const speedDisplay = document.createElement('div');
    speedDisplay.textContent = `速度: ${reader.speed}ms`;
    speedDisplay.id = 'rhythm-speed-display';
    speedDisplay.style.cssText = `
      margin-bottom: 8px;
      text-align: center;
      font-size: 14px;
    `;
    container.appendChild(speedDisplay);
    
    // 速度滑块
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = minSpeed.toString();
    slider.max = maxSpeed.toString();
    slider.step = speedStep.toString();
    slider.value = reader.speed.toString();
    slider.style.width = '100%';
    
    slider.oninput = function() {
      try {
        const newSpeed = parseInt(this.value);
        // 安全更新速度
        const reader = safeGetRhythmReader();
        reader.speed = newSpeed;
        
        speedDisplay.textContent = `速度: ${newSpeed}ms`;
        
        // 安全重置定时器
        if (reader.intervalId) {
          safeClearInterval();
          safeSetInterval(nextChar, newSpeed);
        }
      } catch (err) {
        console.error("速度调整失败:", err);
      }
    };
    container.appendChild(slider);
    
    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
    `;
    
    // 暂停/继续按钮
    const pauseButton = document.createElement('button');
    pauseButton.textContent = '暂停';
    pauseButton.style.cssText = `
      flex: 1;
      margin-right: 5px;
      padding: 5px;
      cursor: pointer;
    `;
    
    pauseButton.onclick = function() {
      try {
        const reader = safeGetRhythmReader();
        if (reader.intervalId) {
          safeClearInterval();
          this.textContent = '继续';
      } else {
          safeSetInterval(nextChar, reader.speed);
          this.textContent = '暂停';
        }
      } catch (err) {
        console.error("暂停/继续失败:", err);
      }
    };
    buttonContainer.appendChild(pauseButton);
    
    // 停止按钮
    const stopButton = document.createElement('button');
    stopButton.textContent = '停止';
    stopButton.style.cssText = `
      flex: 1;
      margin-left: 5px;
      padding: 5px;
      cursor: pointer;
    `;
    
    stopButton.onclick = cleanup;
    buttonContainer.appendChild(stopButton);
    
    container.appendChild(buttonContainer);
    document.body.appendChild(container);
  };
  
  // 添加启动按钮
  const addStartButton = function() {
    // 检查是否已存在
    let existingButton = document.getElementById('rhythm-start-button');
    if (existingButton) existingButton.remove();
    
    const button = document.createElement('button');
    button.id = 'rhythm-start-button';
    button.textContent = '开始节奏阅读';
    button.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 999999;
      background: #4CAF50;
      color: white;
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    // 检查当前模式，如果是闪读模式则隐藏按钮
    const modeSelect = document.getElementById('reading-mode-select');
    if (modeSelect && modeSelect.value === 'flash-reading') {
      button.style.display = 'none';
    }
    
    button.onclick = startReading;
    document.body.appendChild(button);
  };
  
  // 初始化
  const initialize = function() {
    console.log("初始化节奏阅读组件...");
    
    // 确保全局对象初始化
    safeGetRhythmReader();
    
    // 页面加载后添加启动按钮
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addStartButton);
    } else {
      addStartButton();
    }
    
    // 提供API接口
    window.rhythmReader.start = startReading;
    window.rhythmReader.stop = cleanup;
    window.rhythmReader.updateSpeed = function(newSpeed) {
      try {
        const reader = safeGetRhythmReader();
        reader.speed = newSpeed;
        
        // 更新速度显示
        const display = document.getElementById('rhythm-speed-display');
        if (display) display.textContent = `速度: ${newSpeed}ms`;
        
        // 更新定时器
        if (reader.intervalId) {
          safeClearInterval();
          safeSetInterval(nextChar, newSpeed);
        }
        
        return true;
      } catch (err) {
        console.error("更新速度失败:", err);
        return false;
      }
    };
  };
  
  // 执行初始化
  initialize();
  
  console.log("节奏阅读模式初始化完成 - 安全手动翻页版");
})();

// 定义一个全局函数用于从应用代码中启动节奏阅读
window.activateRhythmReadingMode = function() {
  console.log("尝试从应用代码中启动节奏阅读模式");
  if (window.rhythmReader) {
    if (window.rhythmReader.active) {
      console.log("节奏阅读模式已经在运行");
        } else {
      window.rhythmReader.start();
    }
  } else {
    console.error("节奏阅读模式未初始化");
    alert("无法启动节奏阅读模式：组件未初始化");
  }
};

// 更新初始化函数
const initializeRhythmReading = () => {
  // 不再自动初始化，而是等待用户选择
  console.log("节奏阅读模式准备就绪，等待用户选择");
};

// 更新启动函数
const startRhythmReading = () => {
  if (window.rhythmReader && typeof window.rhythmReader.start === 'function') {
    window.rhythmReader.start();
  }
};

// 节奏阅读模式 - 自动翻页版
(function() {
  console.log("节奏阅读模式 - 自动翻页版初始化");
  
  // 状态变量
  let isActive = false;
  let intervalId = null;
  let charElements = [];
  let currentIndex = 0;
  let readIndices = new Set();
  
  // 进度监控 - 记录已读页数
  let pagesRead = 0;
  
  // 查找下一页按钮的帮助函数
  const findNextPageButton = function() {
    // 常见的选择器
    const selectors = [
      '.next-page',
      '.next',
      '#next',
      '[aria-label="下一页"]',
      '[aria-label="Next"]',
      'button:contains("下一页")', 
      'button:contains("Next")'
    ];
    
    for (const selector of selectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (btn.offsetParent !== null) { // 确保按钮可见
            return btn;
          }
        }
      } catch(e) {}
    }
    
    // 如果通过选择器找不到，尝试通过文本内容查找
    const allButtons = document.querySelectorAll('button, a, div[role="button"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text === '下一页' || text === 'next' || text === '>' || text === '→') {
        if (btn.offsetParent !== null) {
          return btn;
        }
      }
    }
    
    return null;
  };
  
  // 自动翻页函数
  const autoTurnPage = function() {
    console.log("尝试自动翻页...");
    
    // 找到下一页按钮
    const nextButton = findNextPageButton();
    
    if (!nextButton) {
      console.log("未找到下一页按钮");
      showMessage("已读完当前页，但未找到下一页按钮");
        return;
      }
    
    // 暂停当前阅读
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    
    // 增加已读页数
    pagesRead++;
    console.log(`已读完第 ${pagesRead} 页，点击下一页按钮`);
    
    // 模拟点击下一页按钮
    nextButton.click();
    
    // 监听DOM变化，等待新页面加载
    const observer = new MutationObserver((mutations) => {
      // 检查新内容是否已加载
      const contentAdded = mutations.some(mutation => 
        mutation.type === 'childList' && mutation.addedNodes.length > 0
      );
      
      if (contentAdded) {
        console.log("检测到新内容已加载");
        // 停止观察
        observer.disconnect();
        
        // 延迟一下，确保新页面完全加载
        setTimeout(() => {
          // 重新启动节奏阅读模式
          console.log("在新页面上重新启动节奏阅读模式");
          startReading();
        }, 800);
      }
    });
    
    // 开始观察文档变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };
  
  // 清理函数
  const cleanup = function() {
    console.log("执行清理...");
    
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    
    try {
      document.querySelectorAll('.rhythm-char').forEach(span => {
        if (span.parentNode) {
          span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        }
      });
    } catch(e) {
      console.error("清理文本失败:", e);
    }
    
    charElements = [];
    currentIndex = 0;
    readIndices = new Set();
    isActive = false;
    pagesRead = 0;
    
    const button = document.getElementById('rhythm-control-button');
    if (button) button.remove();
  };
  
  // 简单通知
  const showMessage = function(message) {
    console.log(message);
    // 移除alert，只保留控制台日志
    // alert(message);
  };
  
  // 添加控制按钮
  const addButton = function() {
    const existingButton = document.getElementById('rhythm-control-button');
    if (existingButton) existingButton.remove();
    
    const button = document.createElement('button');
    button.id = 'rhythm-control-button';
    button.textContent = '暂停节奏阅读';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #4CAF50;
      color: white;
      padding: 10px 15px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    `;
    
    // 检查当前模式，如果是闪读模式则隐藏按钮
    const modeSelect = document.getElementById('reading-mode-select');
    if (modeSelect && modeSelect.value === 'flash-reading') {
      button.style.display = 'none';
    }
    
    button.onclick = function() {
      if (intervalId) {
        // 暂停
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        button.textContent = '继续节奏阅读';
        button.style.background = '#2196F3';
        } else {
        // 继续
        intervalId = setInterval(nextChar, 300);
        button.textContent = '暂停节奏阅读';
        button.style.background = '#4CAF50';
      }
    };
    
    document.body.appendChild(button);
    return button;
  };
  
  // 启动阅读
  const startReading = function() {
    console.log("启动节奏阅读...");
    
    // 清理之前的实例
    cleanup();
    
    // 查找内容容器
    const container = document.querySelector('.pdf-content') || 
                      document.querySelector('[class*="pdf"]') || 
                      document.querySelector('article') || 
                      document.querySelector('main') || 
                      document.body;
    
    // 查找所有文本节点
    const textNodes = [];
    const findText = function(element) {
      for (let i = 0; i < element.childNodes.length; i++) {
        const node = element.childNodes[i];
        if (node.nodeType === 3 && node.nodeValue.trim() !== '') {
          textNodes.push(node);
        } else if (node.nodeType === 1 && 
                  !['SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'SELECT', 'NOSCRIPT'].includes(node.tagName)) {
          findText(node);
        }
      }
    };
    findText(container);
    
    if (textNodes.length === 0) {
      showMessage("错误: 未找到文本内容");
      return;
    }
    
    // 处理文本节点
    try {
      textNodes.forEach(node => {
        if (!node.nodeValue || !node.parentNode) return;
        
        const text = node.nodeValue;
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < text.length; i++) {
          const span = document.createElement('span');
          span.textContent = text[i];
          span.className = 'rhythm-char';
          span.dataset.index = charElements.length;
          
          fragment.appendChild(span);
          charElements.push(span);
        }
        
        node.parentNode.replaceChild(fragment, node);
      });
    } catch(e) {
      console.error("处理文本失败:", e);
      showMessage("生成节奏阅读效果失败");
      return;
    }
    
    if (charElements.length === 0) {
      showMessage("未找到可读内容");
      return;
    }
    
    // 激活状态
    isActive = true;
    currentIndex = 0;
    
    // 更新显示
    updateDisplay();
    
    // 开始阅读
    intervalId = setInterval(nextChar, 300);
    
    addButton();
  };
  
  // 更新显示
  const updateDisplay = function() {
    charElements.forEach((span, index) => {
      if (index === currentIndex) {
        span.style.color = 'green';
        span.style.fontWeight = 'bold';
      } else if (readIndices.has(index)) {
        span.style.color = 'white';
      } else {
        span.style.color = 'rgba(200,200,200,0.3)';
      }
    });
  };
  
  // 下一个字符
  const nextChar = function() {
    if (!isActive || !charElements.length) return;
    
    readIndices.add(currentIndex);
    
    currentIndex++;
    if (currentIndex >= charElements.length) {
      // 当前页已读完
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      console.log("当前页已读完，尝试翻页");
      autoTurnPage(); // 尝试自动翻页
        return;
      }
    
    updateDisplay();
  };
  
  // 处理模式切换
  const handleModeChange = function(mode) {
    console.log("模式更改为:", mode);
    
    if (mode !== 'rhythm' && mode !== 'rhythmReading' && isActive) {
      cleanup();
    }
  };
  
  // 重写模式切换函数
  const originalFunction = window.readingModeChanged;
  window.readingModeChanged = function(mode) {
    if (typeof originalFunction === 'function') {
      try {
        originalFunction(mode);
      } catch(e) {}
    }
    
    handleModeChange(mode);
  };
  
  // 初始化
  const initialize = function() {
    console.log("初始化节奏阅读组件...");
  };
  
  // 等待DOM加载完成
  document.addEventListener('DOMContentLoaded', initialize);
  
  // 暴露全局API
  window.manualStartRhythmReading = startReading;
  
  console.log("节奏阅读模式初始化完成 - 自动翻页版");
})();

const App = () => {
  // 状态定义
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [pdfInstance, setPdfInstance] = useState(null);
  const [extractedTextPages, setExtractedTextPages] = useState([]);
  const [readingMode, setReadingMode] = useState('normal');
  const [posMode, setPosMode] = useState('none');
  const [markdownContent, setMarkdownContent] = useState('');
  const readerContainerRef = useRef(null);
  const [content, setContent] = useState('');
  const [pdfDocument, setPdfDocument] = useState(null);
  const [isTableOfContents, setIsTableOfContents] = useState(false);
  const [jumpToPage, setJumpToPage] = useState('');
  const [message, setMessage] = useState('');
  const [messageTimeout, setMessageTimeout] = useState(null);
  
  // 添加showMessage函数定义
  const showMessage = (text, duration = 3000) => {
    // 清除之前的消息超时
    if (messageTimeout) {
      clearTimeout(messageTimeout);
    }
    
    setMessage(text);
    const timeout = setTimeout(() => {
      setMessage('');
    }, duration);
    setMessageTimeout(timeout);
  };
  
  // 实现缺失的函数
  // 应用深色背景
  const applyDarkBackground = () => {
    document.body.classList.add('dark-background');
    
    // 添加必要的CSS样式
    if (!document.getElementById('dark-background-style')) {
      const style = document.createElement('style');
      style.id = 'dark-background-style';
      style.textContent = `
        .dark-background {
          background-color: #000 !important;
        }
        .dark-background .sidebar {
          background: linear-gradient(145deg, #4834d4, #341f9e) !important;
        }
        .dark-background .page-content {
          background-color: #000 !important;
        }
        .dark-background .main-content {
          background-color: #000 !important;
        }
      `;
      document.head.appendChild(style);
    }
  };
  
  // 恢复正常背景
  const restoreDarkBackground = () => {
    document.body.classList.remove('dark-background');
  };
  
  // 添加裸眼3D样式
  const addNakedEye3DStyles = () => {
    if (!document.getElementById('naked-eye-3d-style')) {
      const style = document.createElement('style');
      style.id = 'naked-eye-3d-style';
      style.textContent = `
        .naked-eye-3d-container {
          position: relative;
          perspective: 800px;
          width: 100%;
        }
        
        .naked-eye-3d-text {
          display: inline-block;
          animation: float 3s ease-in-out infinite;
          text-shadow: 0 0 5px rgba(255,255,255,0.3);
          padding: 0 4px;
          color: white;
          filter: drop-shadow(0 0 5px rgba(120, 220, 255, 0.6));
        }
        
        @keyframes float {
          0% { transform: translateZ(0px); }
          50% { transform: translateZ(20px); }
          100% { transform: translateZ(0px); }
        }
      `;
      document.head.appendChild(style);
    }
  };
  
  // 添加舒适3D样式
  const addComfortable3DStyles = () => {
    if (!document.getElementById('comfortable-3d-style')) {
      const style = document.createElement('style');
      style.id = 'comfortable-3d-style';
      style.textContent = `
        .emboss-3d-text {
          color: #fff;
          text-shadow: 
            1px 1px 1px rgba(0,0,0,0.5),
            -1px -1px 1px rgba(255,255,255,0.5);
          letter-spacing: 1.5px;
          font-weight: 500;
        }
        
        .float-3d-text {
          display: inline-block;
          transform-style: preserve-3d;
          transform: perspective(500px) translateZ(10px);
          text-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        
        .gradient-3d-text {
          display: inline-block;
          background: linear-gradient(to bottom, #fff, #aaa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
      `;
      document.head.appendChild(style);
    }
  };
  
  // 添加闪读样式
  const addFlashReadingStyles = () => {
    if (!document.getElementById('flash-reading-style')) {
      const style = document.createElement('style');
      style.id = 'flash-reading-style';
      style.textContent = `
        .flash-reading-container {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 20px;
        }
        
        .flash-reading-display-wrapper {
          position: relative;
          margin: 40px 0;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .flash-reading-display {
          font-size: 36px;
          font-weight: bold;
          text-align: center;
          color: white;
          min-height: 80px;
          max-width: 90%;
          padding: 20px 40px;
          position: relative; /* 允许绝对定位的覆盖层 */
          z-index: 2;
        }
        
        .flash-reading-cover {
          position: absolute;
          width: 100%;
          height: 100%;
          background-color: rgba(128, 128, 128, 0.6); /* 灰色遮罩 */
          border-radius: 8px;
          z-index: 1; /* 确保在文本后面 */
        }
        
        .flash-reading-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
          width: 100%;
        }
        
        .flash-reading-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }
        
        .flash-reading-speed {
          display: flex;
          align-items: center;
          color: white;
          width: 80%;
          max-width: 400px;
          gap: 10px;
        }
        
        .flash-reading-slider {
          flex: 1;
          height: 8px;
          appearance: none;
          background: #555;
          border-radius: 4px;
          outline: none;
        }
        
        .flash-reading-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #6c5ce7;
          cursor: pointer;
        }
        
        .flash-reading-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          background-color: #6c5ce7;
          color: white;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .flash-reading-btn:hover {
          background-color: #5344c0;
        }
        
        .flash-reading-btn:disabled {
          background-color: #aaa;
          cursor: not-allowed;
        }
        
        .flash-reading-progress {
          color: white;
          font-size: 14px;
          margin-top: 10px;
        }
        .flash-reading-speed-note {
          font-size: 12px;
          color: #ccc;
          margin-left: 5px;
        }
      `;
      document.head.appendChild(style);
    }
  };
  
  // 初始化闪读模式
  const initializeFlashReading = () => {
    // 添加样式
    addFlashReadingStyles();
    
    const sentences = window.flashReadingSentences;
    if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
      console.error('闪读模式: 未找到句子数据');
        return;
      }
    
    // 获取全局UI元素
    const display = document.getElementById('flash-reading-display');
    const speedSlider = document.getElementById('flash-reading-speed');
    const speedValue = document.getElementById('flash-reading-speed-value');
    const playButton = document.getElementById('flash-reading-play');
    const pauseButton = document.getElementById('flash-reading-pause');
    const stopButton = document.getElementById('flash-reading-stop');
    const prevButton = document.getElementById('flash-reading-prev-sentence');
    const nextButton = document.getElementById('flash-reading-next-sentence');
    const progress = document.getElementById('flash-reading-progress');
    const cover = document.querySelector('.flash-reading-cover');
    
    if (!display || !speedSlider || !speedValue || !playButton || !pauseButton || !stopButton || !prevButton || !nextButton || !progress || !cover) {
      console.error('闪读模式: 未找到UI元素');
        return;
      }

    // 创建闪读控制器
    window.flashReader = {
      sentences: sentences,
      currentIndex: 0,
      interval: null,
      speed: parseInt(speedSlider.value),
      isPlaying: false,
      
      // 开始闪读
      start() {
        if (this.interval) {
          clearInterval(this.interval);
        }
        
        this.isPlaying = true;
        playButton.disabled = true;
        pauseButton.disabled = false;
        progress.textContent = `进度：${this.currentIndex + 1} / ${this.sentences.length}`;
        
        // 显示当前句子
        this.displayCurrentSentence();
        
        // 设置闪读间隔
        this.interval = setInterval(() => {
          this.currentIndex++;
          
          if (this.currentIndex >= this.sentences.length) {
            this.stop();
            display.textContent = '阅读完成';
            return;
          }
          
          this.displayCurrentSentence();
          progress.textContent = `进度：${this.currentIndex + 1} / ${this.sentences.length}`;
        }, this.speed);
      },
      
      // 显示当前句子
      displayCurrentSentence() {
        if (this.currentIndex < this.sentences.length) {
          const currentSentence = this.sentences[this.currentIndex];
          display.textContent = currentSentence;
          display.style.color = 'white'; // 确保文本为白色
          
          // 调整背景以适应内容
          setTimeout(() => {
            const displayRect = display.getBoundingClientRect();
            // 确保覆盖层完全包裹文本
            cover.style.width = `${displayRect.width}px`;
            cover.style.height = `${displayRect.height}px`;
          }, 10);
        }
      },
      
      // 暂停闪读
      pause() {
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        
        this.isPlaying = false;
        playButton.disabled = false;
        pauseButton.disabled = true;
      },
      
      // 停止闪读
      stop() {
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        
        this.isPlaying = false;
        this.currentIndex = 0;
        playButton.disabled = false;
        pauseButton.disabled = true;
        
        display.textContent = '准备开始';
        progress.textContent = `进度：0 / ${this.sentences.length}`; // 重置进度
      },
      
      // 更新速度
      updateSpeed(newSpeed) {
        this.speed = newSpeed;
        speedValue.textContent = `${newSpeed} ms`;
        
        // 保存速度设置到本地存储
        localStorage.setItem('flash-reading-speed', newSpeed);
        
        // 如果正在播放，重新开始以应用新速度
        if (this.isPlaying) {
          clearInterval(this.interval);
          this.start(); // 直接调用start方法重新开始
        }
      },

      // 返回上一句
      prevSentence() {
        if (this.currentIndex > 0) {
          this.currentIndex--;
          this.displayCurrentSentence();
          progress.textContent = `进度：${this.currentIndex + 1} / ${this.sentences.length}`;
        }
      },

      // 跳到下一句
      nextSentence() {
        if (this.currentIndex < this.sentences.length - 1) {
          this.currentIndex++;
          this.displayCurrentSentence();
          progress.textContent = `进度：${this.currentIndex + 1} / ${this.sentences.length}`;
        }
      },

      // 清理资源
      cleanup() {
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        this.isPlaying = false;
        this.currentIndex = 0;
      }
    };
    
    // 添加事件监听器
    playButton.addEventListener('click', () => {
      window.flashReader.start();
    });
    
    pauseButton.addEventListener('click', () => {
      window.flashReader.pause();
    });
    
    stopButton.addEventListener('click', () => {
      window.flashReader.stop();
    });
    
    speedSlider.addEventListener('input', (e) => {
      const newSpeed = parseInt(e.target.value);
      window.flashReader.updateSpeed(newSpeed);
    });

    prevButton.addEventListener('click', () => {
      window.flashReader.prevSentence();
    });

    nextButton.addEventListener('click', () => {
      window.flashReader.nextSentence();
    });
    
    // 初始化
    const savedSpeed = localStorage.getItem('flash-reading-speed');
    const initialSpeed = savedSpeed ? parseInt(savedSpeed) : 1000;
    speedSlider.value = initialSpeed;
    window.flashReader.updateSpeed(initialSpeed);
    
    console.log('闪读模式已初始化，共 ' + sentences.length + ' 个句子');
  };
  
  // 创建闪读内容
  const createFlashReadingContent = (text) => {
    return `<div class="flash-reading-content">
      <p>${text}</p>
    </div>`;
  };

  // 格式化文本为HTML
  const formatTextToHtml = (text) => {
    // 分段处理
    const paragraphs = text.split(/(?<=\.)\s+/);
    let html = '<div class="pdf-content">';
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') return;
      html += `<p class="pdf-paragraph">${paragraph}</p>`;
    });
    
    html += '</div>';
    return html;
  };
  
  // 格式化文本用于鼠标跟随
  const formatTextForMouseFollow = (text) => {
    const paragraphs = text.split(/(?<=\.)\s+/);
    let html = '<div class="pdf-content mouse-follow-content">';
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') return;
      
      // 为每个单词添加span，以便于添加高亮效果
      const words = paragraph.split(/(\s+)/);
      let processedParagraph = '';
      
      words.forEach(word => {
        if (word.trim() === '') {
          processedParagraph += word;
        } else {
          processedParagraph += `<span class="follow-word">${word}</span>`;
        }
      });
      
      html += `<p class="pdf-paragraph" data-follow="true">${processedParagraph}</p>`;
    });
    
    html += '</div>';
    return html;
  };
  
  // 应用静态高亮
  const applyStaticHighlight = (text) => {
    // 分段处理
    const paragraphs = text.split(/(?<=\.)\s+/);
    let html = '<div class="pdf-content">';
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') return;
      
      // 为单词随机添加颜色高亮
      const words = paragraph.split(/(\s+)/);
      let processedParagraph = '';
      let lastColor = null;
      
      words.forEach(word => {
        if (word.trim() === '') {
          processedParagraph += word;
          return;
        }
        
        // 随机决定是否高亮和使用哪种颜色
        if (Math.random() < 0.7) {
          let color;
          if (lastColor === 'red') {
            color = 'blue';
          } else if (lastColor === 'blue') {
            color = 'red';
  } else {
            color = Math.random() < 0.5 ? 'red' : 'blue';
          }
          lastColor = color;
          
          processedParagraph += `<span class="highlight-word ${color}">${word}</span>`;
        } else {
          processedParagraph += word;
        }
      });
      
      html += `<p class="pdf-paragraph">${processedParagraph}</p>`;
    });
    
    html += '</div>';
    return html;
  };
  
  // 应用裸眼3D效果
  const applyNakedEye3dEffect = (text) => {
    // 分段处理
    const paragraphs = text.split(/(?<=\.)\s+/);
    let html = '<div class="pdf-content naked-eye-3d-container">';
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') return;
      
      // 为每个词添加3D效果
      const words = paragraph.split(/(\s+)/);
      let processedParagraph = '';
      
      words.forEach(word => {
        if (word.trim() === '') {
          processedParagraph += word;
        } else {
          processedParagraph += `<span class="naked-eye-3d-text">${word}</span>`;
        }
      });
      
      html += `<p class="pdf-paragraph">${processedParagraph}</p>`;
    });
    
    html += '</div>';
    return html;
  };
  
  // 应用舒适3D效果
  const applyComfortable3dEffect = (text) => {
    // 分段处理
    const paragraphs = text.split(/(?<=\.)\s+/);
    let html = '<div class="pdf-content">';
    
    paragraphs.forEach(paragraph => {
      if (paragraph.trim() === '') return;
      
      // 为每个词随机应用不同的3D效果
      const words = paragraph.split(/(\s+)/);
      let processedParagraph = '';
      
      words.forEach(word => {
        if (word.trim() === '') {
          processedParagraph += word;
  } else {
          // 随机选择3D效果类型
          const effectTypes = ['emboss-3d-text', 'float-3d-text', 'gradient-3d-text'];
          const effectClass = effectTypes[Math.floor(Math.random() * effectTypes.length)];
          
          processedParagraph += `<span class="${effectClass}">${word}</span>`;
        }
      });
      
      html += `<p class="pdf-paragraph">${processedParagraph}</p>`;
    });
    
    html += '</div>';
    return html;
  };
  
  // 初始化裸眼3D
  const initializeNakedEye3D = () => {
    // 为裸眼3D文本添加动画
    const textElements = document.querySelectorAll('.naked-eye-3d-text');
    textElements.forEach((element, index) => {
      // 添加随机延迟，使动画错开
      const delay = Math.random() * 2;
      element.style.animationDelay = `${delay}s`;
    });
  };

  // 添加鼠标跟随监听器
  const addMouseFollowListeners = () => {
    // 获取内容容器
    const contentArea = document.querySelector('.mouse-follow-content');
    if (!contentArea) {
      console.error('未找到鼠标跟随内容区域');
      return;
    }
    
    // 上一个高亮的行
    let lastHighlightedLine = null;
    
    // 监听鼠标移动 - 精确的行检测
    const mouseMoveHandler = (e) => {
      // 获取鼠标位置
      const mouseY = e.clientY;
      
      // 获取所有行
      const allLines = contentArea.querySelectorAll('.follow-line');
      let foundLine = null;
      let minDistance = Infinity;
      
      // 寻找鼠标所在的精确行
      allLines.forEach(line => {
        const rect = line.getBoundingClientRect();
        const lineCenter = rect.top + rect.height / 2;
        const distance = Math.abs(mouseY - lineCenter);
        
        // 如果鼠标在行范围内，计算到行中心的距离
        if (mouseY >= rect.top && mouseY <= rect.bottom) {
          if (distance < minDistance) {
            minDistance = distance;
            foundLine = line;
        }
      }
    });
    
      // 更新高亮状态
      if (lastHighlightedLine && lastHighlightedLine !== foundLine) {
        // 移除旧高亮
        lastHighlightedLine.classList.remove('highlighted');
        
        // 移除旧emoji
        const oldEmojiContainer = lastHighlightedLine.querySelector('.emoji-container');
        if (oldEmojiContainer) {
          oldEmojiContainer.textContent = '';
        }
      }
      
      if (foundLine) {
        // 添加新高亮
        foundLine.classList.add('highlighted');
        
        // 添加随机emoji
        const emojiContainer = foundLine.querySelector('.emoji-container');
        if (emojiContainer && !emojiContainer.textContent) {
          emojiContainer.textContent = getRandomEmoji() + ' ';
        }
        
        lastHighlightedLine = foundLine;
        
        // 调试输出
        console.log('当前高亮行:', foundLine.textContent.substring(0, 30) + '...');
      } else if (lastHighlightedLine) {
        // 如果没有找到新行，且有上一个高亮行，移除它
        lastHighlightedLine.classList.remove('highlighted');
        
        // 移除emoji
        const oldEmojiContainer = lastHighlightedLine.querySelector('.emoji-container');
        if (oldEmojiContainer) {
          oldEmojiContainer.textContent = '';
        }
        
        lastHighlightedLine = null;
      }
    };
    
    // 鼠标离开处理
    const mouseLeaveHandler = () => {
      // 清除当前高亮
      if (lastHighlightedLine) {
        lastHighlightedLine.classList.remove('highlighted');
        
        // 移除emoji
        const emojiContainer = lastHighlightedLine.querySelector('.emoji-container');
        if (emojiContainer) {
          emojiContainer.textContent = '';
        }
        
        lastHighlightedLine = null;
      }
    };
    
    // 存储处理函数引用
    window.eventTracker = window.eventTracker || { mouseFollowHandlers: [] };
    window.eventTracker.mouseFollowHandlers.push(
      { element: contentArea, event: 'mousemove', handler: mouseMoveHandler },
      { element: contentArea, event: 'mouseleave', handler: mouseLeaveHandler }
    );
    
    // 添加事件监听器
    contentArea.addEventListener('mousemove', mouseMoveHandler);
    contentArea.addEventListener('mouseleave', mouseLeaveHandler);
    
    console.log('改进的鼠标跟随监听器已初始化');
  };
  
  // 初始化PDF.js
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);
  
  // 当阅读模式改变时应用效果
  useEffect(() => {
    if (readingMode === 'follow-mouse') {
      // 确保DOM更新完成后初始化鼠标跟随功能
      setTimeout(() => {
        initializeMouseFollow();
      }, 50);
    }
  }, [readingMode, markdownContent]);

  // 修改PDF处理函数，确保内容正确提取和显示
  const handlePdfFile = async (file) => {
    try {
      const fileURL = URL.createObjectURL(file);
      const loadingTask = pdfjsLib.getDocument(fileURL);
      const pdf = await loadingTask.promise;
      
      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      
      // 加载第一页
      await extractAndProcessPage(pdf, 1);
      
      // 添加调试信息
      console.log('PDF加载成功，页数:', pdf.numPages);
    } catch (error) {
      console.error('加载PDF时出错:', error);
      alert('PDF加载失败，请尝试其他文件');
    }
  };
  
  // 提取和处理PDF页面内容的函数 - 区分目录和正文页面
  const extractAndProcessPage = async (pdf, pageNum) => {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      // 判断当前页面是否为目录页
      const isTableOfContents = await detectIfTocPage(textContent);
      
      if (isTableOfContents) {
        // 处理目录页面 - 保持原布局，仅调整字间距
        await processTocPage(textContent, viewport);
      } else {
        // 处理正文页面 - 以句号为标准划分段落
        await processContentPage(page, readingMode);
      }
      
      // 在内容处理完成后，如果是鼠标跟随模式，添加监听器
      if (readingMode === 'follow-mouse') {
        setTimeout(() => {
          addMouseFollowListeners();
        }, 50);
      }
      
      return true; // 返回成功标志
    } catch (error) {
      console.error('处理PDF页面时出错:', error);
      setContent('<div>无法处理PDF内容</div>');
      return false;
    }
  };

  // 检测是否为目录页
  const detectIfTocPage = async (textContent) => {
    const textItems = textContent.items;
    let fullText = textItems.map(item => item.str).join('');
    
    // 检查特征: 
    // 1. 页面上包含"目录"字样
    // 2. 行尾通常有页码和前导符（...）
    // 3. 短行居多，且多有规律的缩进
    const hasTocKeywords = /目\s*录|contents|index/i.test(fullText);
    const hasPageNumberPatterns = /\.{2,}|…{1,}\s*\d+/.test(fullText);
    
    // 检查行的特征
    let shortLinesCount = 0;
    let linesWithNumbersCount = 0;
    
    // 按Y坐标分组
    const lineMap = new Map();
    textItems.forEach(item => {
      const yKey = Math.round(item.transform[5]);
      if (!lineMap.has(yKey)) {
        lineMap.set(yKey, []);
      }
      lineMap.get(yKey).push(item);
    });
    
    const lines = [...lineMap.values()];
    
    lines.forEach(line => {
      const lineText = line.map(item => item.str).join('');
      if (lineText.length < 50) shortLinesCount++;
      if (/\d+$/.test(lineText)) linesWithNumbersCount++;
    });
    
    const shortLineRatio = shortLinesCount / lines.length;
    const numberLineRatio = linesWithNumbersCount / lines.length;
    
    return hasTocKeywords || hasPageNumberPatterns || (shortLineRatio > 0.7 && numberLineRatio > 0.3);
  };

  // 处理目录页面 - 严格保持原始布局
  const processTocPage = async (textContent, viewport) => {
    const textItems = textContent.items;
    
    // 生成HTML，严格保持原始位置和格式
    let htmlContent = '<div class="pdf-toc-page">';
    
    textItems.forEach(item => {
      // 获取原始位置信息
      const x = item.transform[4];
      const y = viewport.height - item.transform[5]; // 转换Y坐标
      
      // 获取原始字体信息
      const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
      const fontWeight = item.fontName && item.fontName.toLowerCase().includes('bold') ? 'bold' : 'normal';
      
      // 仅应用字间距，其他完全保持原样
      const spacedText = item.str.split('').join('\u200A');
      
      // 使用绝对定位和原始样式属性
      htmlContent += `<span style="
        position: absolute; 
        left: ${x}px; 
        top: ${y}px; 
        font-size: ${fontSize}px; 
        font-weight: ${fontWeight};
        letter-spacing: 0.3em;
        white-space: nowrap;
        font-family: inherit;
        color: inherit;
      ">${spacedText}</span>`;
    });
    
    htmlContent += '</div>';
    setContent(htmlContent);
  };

  // 获取鼠标位置下的文本节点
  const getTextNodeAtPosition = (element, x, y) => {
    const nodes = element.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        for (let j = 0; j < rects.length; j++) {
          const rect = rects[j];
          if (y >= rect.top && y <= rect.bottom && 
              x >= rect.left && x <= rect.right) {
            return node;
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const found = getTextNodeAtPosition(node, x, y);
        if (found) return found;
      }
    }
    return null;
  };

  // 处理文本高亮
  const processTextWithHighlight = (text) => {
    // 将文本按空格和标点符号分割成词
    const words = text.split(/([\s.,!?，。！？]+)/);
    let result = '';
    let lastColor = null;
    
    words.forEach(word => {
      if (!word || /^\s+$/.test(word)) {
        result += word;
        return;
      }
      
      if (Math.random() < 0.8) {
        let color;
        if (lastColor === 'red') {
          color = 'blue';
        } else if (lastColor === 'blue') {
          color = 'red';
        } else {
          color = Math.random() < 0.5 ? 'red' : 'blue';
        }
        lastColor = color;
        
        result += `<span class="highlight-word ${color}">${word}</span>`;
      } else {
        result += word;
      }
    });
    
    return result;
  };

  // 处理内容页面 - 按句子划分段落
  const processContentPage = async (page, mode) => {
    try {
      const textContent = await page.getTextContent();
      const textItems = textContent.items;
      let extractedText = textItems.map(item => item.str).join(' ');
      
      // 移除多余的空格
      extractedText = extractedText.replace(/\s+/g, ' ').trim();
      
      // 按句子划分内容（句号、问号、感叹号等作为分隔符）
      const sentences = splitIntoSentences(extractedText);
      
      // 根据阅读模式处理文本
      let processedContent = '';
      switch(mode) {
        case 'normal':
          processedContent = formatSentencesToHtml(sentences);
          break;
        case 'static':
          // 使用ADHD友好的静态高亮处理
          console.log('应用ADHD友好的静态高亮模式');
          processedContent = formatSimpleHighlightedText(sentences);
          break;
        case 'follow-mouse':
          processedContent = formatSentencesForMouseFollow(sentences);
          break;
        case 'rhythm':
          processedContent = formatSentencesToHtml(sentences);
          break;
        case 'comfortable-3d':
          processedContent = applyComfortable3dEffectToSentences(sentences);
          break;
        case 'flash-reading':
          processedContent = createFlashReadingContentFromSentences(sentences);
          break;
        default:
          processedContent = formatSentencesToHtml(sentences);
      }
      
      setContent(processedContent);
      
      // 如果是静态高亮模式，添加延时验证检查
      if (mode === 'static') {
        setTimeout(() => {
          const contentArea = document.querySelector('.adhd-highlight-mode');
          if (contentArea) {
            console.log('静态高亮模式元素存在');
            const paragraphs = contentArea.querySelectorAll('.pdf-paragraph');
            console.log(`找到 ${paragraphs.length} 个段落`);
            
            // 检查样式是否正确应用
            if (paragraphs.length > 0) {
              const firstPara = paragraphs[0];
              const styles = window.getComputedStyle(firstPara);
              console.log('段落应用的样式:', {
                color: styles.color,
                backgroundColor: styles.backgroundColor,
                fontFamily: styles.fontFamily,
                fontSize: styles.fontSize
              });
            }
          }
        }, 200);
      }
    } catch (error) {
      console.error('处理内容页面时出错:', error);
      setContent('<div>无法处理PDF内容</div>');
    }
  };

  // 将文本分割成句子
  const splitIntoSentences = (text) => {
    // 匹配句号、问号、感叹号后跟空格或结束的模式
    // 支持中英文标点符号
    const sentenceRegex = /([.!?。！？；;]+\s*)/g;
    
    // 分割文本成句子
    const sentences = [];
    let lastIndex = 0;
    let match;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const endIndex = match.index + match[0].length;
      const sentence = text.substring(lastIndex, endIndex).trim();
      
      // 避免添加空句子
      if (sentence) {
        sentences.push(sentence);
      }
      
      lastIndex = endIndex;
    }
    
    // 处理最后一部分（如果没有以句号等结尾）
    if (lastIndex < text.length) {
      const lastSentence = text.substring(lastIndex).trim();
      if (lastSentence) {
        sentences.push(lastSentence);
      }
    }
    
    return sentences;
  };

  // 专门为闪读模式分割文本，以任意标点符号为分隔点
  const splitIntoFlashReadingSegments = (text) => {
    // 匹配任意标点符号包括中英文标点
    const sentenceRegex = /([,.!?:;，。！？：；、]+\s*)/g;
    
    // 分割文本成短句
    const segments = [];
    let lastIndex = 0;
    let match;
    
    while ((match = sentenceRegex.exec(text)) !== null) {
      const endIndex = match.index + match[0].length;
      const segment = text.substring(lastIndex, endIndex).trim();
      
      // 避免添加空段落
      if (segment) {
        segments.push(segment);
      }
      
      lastIndex = endIndex;
    }
    
    // 处理最后一部分（如果没有以标点符号结尾）
    if (lastIndex < text.length) {
      const lastSegment = text.substring(lastIndex).trim();
      if (lastSegment) {
        segments.push(lastSegment);
      }
    }
    
    return segments;
  };

  // 格式化句子为HTML
  const formatSentencesToHtml = (sentences) => {
    let html = '<div class="pdf-content">';
    
    sentences.forEach(sentence => {
      if (sentence.trim() === '') return;
      html += `<p class="pdf-paragraph">${sentence}</p>`;
    });
    
    html += '</div>';
    return html;
  };

  // 为句子应用静态高亮
  const applyStaticHighlightToSentences = (sentences) => {
    let html = '<div class="pdf-content adhd-content">';
    
    sentences.forEach(sentence => {
      if (sentence.trim() === '') return;
      
      // 简单地为句子添加特定样式的class
      html += `<p class="pdf-paragraph adhd-sentence">${sentence}</p>`;
    });
    
    html += '</div>';
    return html;
  };

  // 添加一个生成随机emoji的函数
  const getRandomEmoji = () => {
    const emojis = [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', 
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
      '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
      '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
      '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
      '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
      '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
      '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '💩',
      '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹'
    ];
    return emojis[Math.floor(Math.random() * emojis.length)];
  };

  // 修改鼠标跟随格式化函数，添加随机emoji
  const formatSentencesForMouseFollow = (sentences) => {
    let html = '<div class="pdf-content mouse-follow-content">';
    
    sentences.forEach((sentence, index) => {
      if (sentence.trim() === '') return;
      
      // 不在HTML生成时添加emoji，改为在鼠标悬停时动态添加
      html += `<div class="follow-line" data-line="${index}" data-sentence="${sentence.substring(0, 20)}..." style="color: inherit;"><span class="emoji-container"></span>${sentence}</div>`;
    });
    
    html += '</div>';
    return html;
  };

  // 为舒适3D模式格式化句子
  const applyComfortable3dEffectToSentences = (sentences) => {
    let html = '<div class="pdf-content">';
    
    sentences.forEach(sentence => {
      if (sentence.trim() === '') return;
      
      // 为每个词随机应用不同的3D效果
      const words = sentence.split(/(\s+)/);
      let processedSentence = '';
      
      words.forEach(word => {
        if (word.trim() === '') {
          processedSentence += word;
        } else {
          // 随机选择3D效果类型
          const effectTypes = ['emboss-3d-text', 'float-3d-text', 'gradient-3d-text'];
          const effectClass = effectTypes[Math.floor(Math.random() * effectTypes.length)];
          
          processedSentence += `<span class="${effectClass}">${word}</span>`;
        }
      });
      
      html += `<p class="pdf-paragraph">${processedSentence}</p>`;
    });
    
    html += '</div>';
    return html;
  };

  // 为闪读模式创建内容
  const createFlashReadingContentFromSentences = (sentences) => {
    // 储存句子到全局变量，用于后续显示
    window.flashReadingSentences = sentences;

    // 返回闪读界面的HTML结构
    return `
      <div class="flash-reading-container">
        <div class="flash-reading-controls">
          <div class="flash-reading-buttons">
            <button id="flash-reading-prev-sentence" class="flash-reading-btn">上一句</button>
            <button id="flash-reading-play" class="flash-reading-btn">开始</button>
            <button id="flash-reading-pause" class="flash-reading-btn" disabled>暂停</button>
            <button id="flash-reading-stop" class="flash-reading-btn">停止</button>
            <button id="flash-reading-next-sentence" class="flash-reading-btn">下一句</button>
          </div>
          <div class="flash-reading-speed">
            <span>速度：</span>
            <input type="range" id="flash-reading-speed" min="300" max="1700" step="50" value="1000" class="flash-reading-slider">
            <span id="flash-reading-speed-value">1000 ms</span>
            <span class="flash-reading-speed-note">（数值越小，切换越快）</span>
          </div>
          <div class="flash-reading-progress">
            <span id="flash-reading-progress">进度：0 / ${sentences.length}</span>
          </div>
        </div>
        <div class="flash-reading-display-wrapper">
          <div class="flash-reading-cover"></div> <!-- 这里是闪卡 -->
          <div id="flash-reading-display" class="flash-reading-display">准备开始</div>
        </div>
      </div>`;
  };

  // 处理TXT文件
  const handleTxtFile = async (file) => {
    try {
      const text = await file.text();
      
      // 根据阅读模式选择不同的处理方式
      let processedContent = '';
      
      if (readingMode === 'flash-reading') {
        // 闪读模式下使用特定的分割函数
        const segments = splitIntoFlashReadingSegments(text);
        processedContent = createFlashReadingContentFromSentences(segments);
        
        // 初始化闪读模式
        setTimeout(() => {
          initializeFlashReading();
        }, 100);
      } else {
        // 其他模式使用默认的分割方式
        const sentences = splitIntoSentences(text);
        
        switch(readingMode) {
          case 'normal':
            processedContent = formatSentencesToHtml(sentences);
            break;
          case 'static':
            processedContent = applyStaticHighlightToSentences(sentences);
            break;
          case 'follow-mouse':
            processedContent = formatSentencesForMouseFollow(sentences);
            break;
          case 'comfortable-3d':
            processedContent = applyComfortable3dEffectToSentences(sentences);
            break;
          default:
            processedContent = formatSentencesToHtml(sentences);
        }
      }
      
      // 设置内容
      setContent(processedContent);
      setFileName(file.name);
      
      // 简单模拟页数
      setTotalPages(1);
      setCurrentPage(1);
    } catch (error) {
      console.error('TXT处理错误:', error);
      setContent('<div class="error-message">TXT文件处理失败</div>');
    }
  };

  // 处理Markdown文件
  const handleMarkdownFile = async (file) => {
    try {
      const text = await file.text();
      
      // 使用marked库转换markdown为HTML
      let html = '';
      try {
        if (window.marked) {
          html = window.marked.parse(text);
        } else {
          // 如果没有marked库，简单地拆分为段落
          html = `<div>${text.split("\n\n").map(p => `<p>${p}</p>`).join("")}</div>`;
        }
      } catch (parseError) {
        console.error('Markdown解析错误:', parseError);
        html = `<div>${text}</div>`;
      }
      
      // 提取纯文本内容
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';
      
      // 分割文本为句子
      const sentences = splitIntoSentences(plainText);
      
      // 根据当前阅读模式处理内容
      let processedContent = '';
      switch(readingMode) {
        case 'normal':
          processedContent = formatSentencesToHtml(sentences);
          break;
        case 'static':
          processedContent = applyStaticHighlightToSentences(sentences);
          break;
        case 'follow-mouse':
          processedContent = formatSentencesForMouseFollow(sentences);
          break;
        case 'comfortable-3d':
          processedContent = applyComfortable3dEffectToSentences(sentences);
          break;
        case 'flash-reading':
          // 使用特定的闪读分割函数重新处理文本
          const segments = splitIntoFlashReadingSegments(plainText);
          processedContent = createFlashReadingContentFromSentences(segments);
          
          // 初始化闪读模式
          setTimeout(() => {
            initializeFlashReading();
          }, 100);
          break;
        default:
          processedContent = formatSentencesToHtml(sentences);
      }
      
      // 设置内容
      setContent(processedContent);
      setFileName(file.name);
      
      // 简单模拟页数
      setTotalPages(1);
      setCurrentPage(1);
    } catch (error) {
      console.error('Markdown处理错误:', error);
      setContent('<div class="error-message">Markdown文件处理失败</div>');
    }
  };

  // 文件上传处理
  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    
    setLoading(true);
    setFileName(uploadedFile.name);
    
    try {
      if (uploadedFile.type === 'application/pdf') {
        await handlePdfFile(uploadedFile);
      } else if (uploadedFile.type === 'text/plain' || uploadedFile.name.endsWith('.txt')) {
        await handleTxtFile(uploadedFile);
      } else if (uploadedFile.type === 'text/markdown' || uploadedFile.name.endsWith('.md')) {
        await handleMarkdownFile(uploadedFile);
    } else {
        setContent('<div class="error-message">不支持的文件格式</div>');
      }
    } catch (error) {
      console.error('处理文件时出错:', error);
      setContent('<div class="error-message">处理文件时出错</div>');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有字符位置（优化版 - 记录字符底部位置）
  const getAllCharacterPositions = (container) => {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const positions = [];
    
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent;
      
      // 跳过完全空白的文本节点
      if (!text.trim()) continue;
      
      // 逐字符处理
      for (let i = 0; i < text.length; i++) {
        try {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          
          // 记录字符底部中心位置，而不是中心位置
          positions.push({
            x: rect.left + rect.width/2,  // 水平中心
            y: rect.bottom,               // 字符底部
            char: text[i]
          });
        } catch (error) {
          console.warn('获取字符位置时出错:', error);
          continue;
        }
      }
    }
    
    // 过滤无效位置并排序
    return positions
      .filter(p => p.char.trim() !== '')
      .sort((a, b) => {
        // 先按行排序，同行按列排序
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 5) { // 5px阈值判断是否同一行
          return yDiff;
        }
        return a.x - b.x;
      });
  };

  // 确保元素在容器中居中的专用函数
  const scrollElementToCenter = (elementY, container) => {
    // 判断是容器滚动还是窗口滚动
    const isContainerScrollable = container.scrollHeight > container.clientHeight && 
      ['auto', 'scroll', 'overlay'].includes(window.getComputedStyle(container).overflowY);
    
    // 计算需要滚动的目标位置
    let targetScrollTop;
    
    if (isContainerScrollable) {
      // 容器滚动：计算将元素放在容器中心所需的滚动量
      const containerVisibleHeight = container.clientHeight;
      targetScrollTop = elementY - (containerVisibleHeight / 2);
      
      // 执行滚动
      container.scrollTo({
        top: Math.max(0, targetScrollTop), // 防止滚动到负值
        behavior: 'smooth'
      });
    } else {
      // 窗口滚动：计算将元素放在窗口中心所需的滚动量
      const absoluteElementY = elementY + container.getBoundingClientRect().top;
      targetScrollTop = absoluteElementY - (window.innerHeight / 2);
      
      // 执行滚动
      window.scrollTo({
        top: Math.max(0, targetScrollTop), // 防止滚动到负值
        behavior: 'smooth'
      });
    }
    
    return targetScrollTop;
  };

  // 创建字符底部显示的阅读光标（确保与滚动兼容）
  const createReaderCursor = () => {
    const cursor = document.createElement('div');
    cursor.id = 'auto-reader-cursor';
    cursor.style.cssText = `
      position: absolute;
      width: 10px;
      height: 10px;
      background: #00ff00;
      border-radius: 50%;
      pointer-events: none;
      transform: translateX(-50%);
      box-shadow: 0 0 8px #00ff00;
      animation: pulse-bottom 1s infinite;
      z-index: 9999;
      margin-top: -2px;
    `;
    
    // 添加动画样式
    if (!document.getElementById('reader-cursor-animation')) {
      const style = document.createElement('style');
      style.id = 'reader-cursor-animation';
      style.textContent = `
        @keyframes pulse-bottom {
          0% { transform: translateX(-50%) scale(1); opacity: 0.8; }
          50% { transform: translateX(-50%) scale(1.2); opacity: 1; }
          100% { transform: translateX(-50%) scale(1); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
    
    return cursor;
  };

  // 检测当前位置是否为句子结束
  const isSentenceEnd = (charPosition, positions, index) => {
    // 标点符号列表，用于判断句子结束
    const sentenceEndMarks = ['.', '。', '!', '！', '?', '？', ';', '；'];
    
    // 检查当前字符是否为句子结束标记
    if (sentenceEndMarks.includes(charPosition.char)) {
      // 句子结束后通常有空格或是段落末尾
      const nextIndex = index + 1;
      if (nextIndex >= positions.length || // 已到末尾
          positions[nextIndex].char.trim() === '' || // 下一个是空白
          positions[nextIndex].y > charPosition.y + 5) { // 下一个在新行
        return true;
      }
    }
    
    return false;
  };

  // 查找句子开始位置
  const findSentenceStart = (positions, currentIndex) => {
    let start = currentIndex;
    
    // 向前查找句子开始
    while (start > 0) {
      const prev = positions[start - 1];
      const current = positions[start];
      
      // 如果前一个是句子结束标记，或者有明显的换行，认为是新句子开始
      if (isSentenceEnd(prev, positions, start - 1) || 
          current.y > prev.y + 5) { // 有明显换行
        break;
      }
      
      start--;
    }
    
    return start;
  };

  // 判断元素是否在可见区域内
  const isInVisibleArea = (elementY, container, threshold = 0.2) => {
    // 判断是容器滚动还是窗口滚动
    const isContainerScrollable = container.scrollHeight > container.clientHeight && 
      ['auto', 'scroll', 'overlay'].includes(window.getComputedStyle(container).overflowY);
    
    if (isContainerScrollable) {
      // 容器情况
      const visibleTop = container.scrollTop;
      const visibleBottom = visibleTop + container.clientHeight;
      
      // 元素是否在可见区域的安全范围内（加入阈值缓冲）
      const topThreshold = visibleTop + container.clientHeight * threshold;
      const bottomThreshold = visibleBottom - container.clientHeight * threshold;
      
      return elementY >= topThreshold && elementY <= bottomThreshold;
    } else {
      // 窗口情况
      const absoluteElementY = elementY + container.getBoundingClientRect().top;
      const visibleTop = window.scrollY;
      const visibleBottom = visibleTop + window.innerHeight;
      
      // 元素是否在可见区域的安全范围内
      const topThreshold = visibleTop + window.innerHeight * threshold;
      const bottomThreshold = visibleBottom - window.innerHeight * threshold;
      
      return absoluteElementY >= topThreshold && absoluteElementY <= bottomThreshold;
    }
  };

  // 启动自动阅读（保持一致的轻微滚动行为）
  const startAutoReader = () => {
    if (window.autoReader.charPositions.length === 0) {
      if (window.currentPage < window.totalPages) {
        window.changePage(1);
        return;
      }
      return;
    }
    
    // 重置索引到开头
    window.autoReader.currentIndex = 0;
    
    // 获取内容容器
    const contentContainer = document.querySelector('.page-content');
    if (!contentContainer) return;
    
    if (window.getComputedStyle(contentContainer).position === 'static') {
      contentContainer.style.position = 'relative';
    }
    
    // 创建或获取光标
    let cursor = document.getElementById('auto-reader-cursor');
    if (!cursor) {
      cursor = createReaderCursor();
      contentContainer.appendChild(cursor);
    }
    
    // 创建或获取高亮元素
    let highlight = document.getElementById('auto-reader-highlight');
    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = 'auto-reader-highlight';
      highlight.style.position = 'absolute';
      highlight.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
      highlight.style.borderRadius = '2px';
      highlight.style.pointerEvents = 'none';
      highlight.style.zIndex = '998';
      contentContainer.appendChild(highlight);
    }
    
    // 确定是哪个元素需要滚动（容器或窗口）
    const isContainerScrollable = contentContainer.scrollHeight > contentContainer.clientHeight &&
      ['auto', 'scroll', 'overlay'].includes(window.getComputedStyle(contentContainer).overflowY);
    
    // 估计的行高（用于计算滚动量）
    let lineHeight = 20;
    
    // 尝试获取实际行高
    if (window.autoReader.charPositions.length > 1) {
      for (let i = 1; i < window.autoReader.charPositions.length; i++) {
        const yDiff = Math.abs(window.autoReader.charPositions[i].y - window.autoReader.charPositions[i-1].y);
        if (yDiff > 5) {
          lineHeight = yDiff;
          break;
        }
      }
    }
    
    // 记录上次滚动的位置
    let lastScrolledY = -1;
    const scrollSafeZone = lineHeight * 2.5;
    
    // 设置字符大小的估计值
    let charWidth = 20;
    let charHeight = lineHeight * 0.8;
    
    // 尝试估计字符宽度
    if (window.autoReader.charPositions.length > 1) {
      for (let i = 1; i < window.autoReader.charPositions.length; i++) {
        if (window.autoReader.charPositions[i].x !== window.autoReader.charPositions[i-1].x) {
          const xDiff = Math.abs(window.autoReader.charPositions[i].x - window.autoReader.charPositions[i-1].x);
          if (xDiff > 0 && xDiff < 50) {
            charWidth = xDiff;
            break;
          }
        }
      }
    }
    
    window.autoReader.intervalId = setInterval(() => {
      // 跳过空白字符
      while (window.autoReader.currentIndex < window.autoReader.charPositions.length && 
             window.autoReader.charPositions[window.autoReader.currentIndex]?.char.trim() === '') {
        window.autoReader.currentIndex++;
      }

      // 当前页结束处理
      if (window.autoReader.currentIndex >= window.autoReader.charPositions.length) {
        if (window.currentPage < window.totalPages) {
          window.changePage(1);
          clearInterval(window.autoReader.intervalId);
        } else {
          stopAutoReader();
        }
        return;
      }

      const pos = window.autoReader.charPositions[window.autoReader.currentIndex];
      cursor = document.getElementById('auto-reader-cursor');
      highlight = document.getElementById('auto-reader-highlight');
      
      if (cursor && highlight) {
        const contentRect = contentContainer.getBoundingClientRect();
        
        const relativeX = pos.x - contentRect.left;
        const relativeY = pos.y - contentRect.top + contentContainer.scrollTop;
        
        cursor.style.left = `${relativeX}px`;
        cursor.style.top = `${relativeY - contentContainer.scrollTop}px`;
        
        highlight.style.left = `${relativeX - charWidth/2}px`;
        highlight.style.top = `${relativeY - contentContainer.scrollTop - charHeight}px`;
        highlight.style.width = `${charWidth}px`;
        highlight.style.height = `${charHeight}px`;
        
        // 滚动处理
        const isInRecentlyScrolledArea = Math.abs(relativeY - lastScrolledY) < scrollSafeZone;
        
        if (!isInRecentlyScrolledArea) {
          let needsScroll = false;
          let scrollAmount = 0;
          
          if (isContainerScrollable) {
            const visibleTop = contentContainer.scrollTop;
            const visibleBottom = visibleTop + contentContainer.clientHeight;
            
            if (relativeY > visibleBottom - lineHeight) {
              needsScroll = true;
              scrollAmount = lineHeight * 2;
            } else if (relativeY < visibleTop + lineHeight) {
              needsScroll = true;
              scrollAmount = -lineHeight * 2;
            }
            
            if (needsScroll) {
              contentContainer.scrollBy({
                top: scrollAmount,
                behavior: 'smooth'
              });
              lastScrolledY = relativeY;
            }
          } else {
            const absoluteY = pos.y;
            const visibleTop = window.scrollY;
            const visibleBottom = visibleTop + window.innerHeight;
            
            if (absoluteY > visibleBottom - lineHeight) {
              needsScroll = true;
              scrollAmount = lineHeight * 2;
            } else if (absoluteY < visibleTop + lineHeight) {
              needsScroll = true;
              scrollAmount = -lineHeight * 2;
            }
            
            if (needsScroll) {
              window.scrollBy({
                top: scrollAmount,
                behavior: 'smooth'
              });
              lastScrolledY = absoluteY;
            }
          }
        }
      }
      
      window.autoReader.currentIndex++;
      
    }, window.autoReader.speed);
    
    // 在停止自动阅读时清除所有高亮
    window.autoReader.cleanup = () => {
      // 移除高亮
      const highlight = document.getElementById('auto-reader-highlight');
      if (highlight) {
        highlight.remove();
      }
      
      // 移除光标
      const cursor = document.getElementById('auto-reader-cursor');
      if (cursor) {
        cursor.remove();
      }
    };
  };

  // 修改stopAutoReader函数以包含清理高亮
  const stopAutoReader = () => {
    if (window.autoReader.intervalId) {
      clearInterval(window.autoReader.intervalId);
      window.autoReader.intervalId = null;
      
      // 调用清理函数
      if (window.autoReader.cleanup) {
        window.autoReader.cleanup();
      }
    }
  };

  // 初始化自动阅读模式
  const initializeAutoReader = () => {
    // 清理可能存在的旧数据
    stopAutoReader();
    
    // 重置翻页状态
    window.autoReader.isPageChanging = false;
    
    // 收集所有字符位置
    const content = document.querySelector('.page-content');
    if (!content) return;
    
    // 确保内容滚动到顶部
    if (content.scrollTo) {
      content.scrollTo(0, 0);
    }
    
    // 确保容器有正确的定位
    if (window.getComputedStyle(content).position === 'static') {
      content.style.position = 'relative';
    }
    
    // 收集字符位置
    window.autoReader.charPositions = getAllCharacterPositions(content);
    
    // 如果当前页没有内容，尝试翻页
    if (window.autoReader.charPositions.length === 0) {
      if (currentPage < totalPages && !window.autoReader.isPageChanging) {
        window.autoReader.isPageChanging = true;
        changePage(1);
        return;
      }
      return;
    }
    
    // 立即开始移动
    startAutoReader();
  };

  // 修改阅读模式切换函数
  const handleReadingModeChange = async (e) => {
    const newMode = e.target.value;
    const prevMode = readingMode;
    
    console.log(`切换阅读模式: 从 ${prevMode} 到 ${newMode}`);
    
    // 如果正在进行节奏阅读，且切换到其他模式，则停止节奏阅读
    if (prevMode === 'rhythm' && newMode !== 'rhythm') {
      console.log('正在退出节奏阅读模式，执行清理...');
      
      // 停止通过全局API
      if (window.rhythmReader && typeof window.rhythmReader.stop === 'function') {
        window.rhythmReader.stop();
      }
      
      // 停止手动版本
      if (window.manualStartRhythmReading) {
        const controlPanel = document.getElementById('rhythm-speed-controller');
        if (controlPanel) controlPanel.remove();
        
        // 清理节奏阅读的高亮字符
        try {
          document.querySelectorAll('.rhythm-char').forEach(span => {
            if (span.parentNode) {
              span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
            }
          });
        } catch(e) {
          console.error("清理节奏阅读文本失败:", e);
        }
        
        // 清理区间
        if (window.rhythmReaderGlobal && window.rhythmReaderGlobal.intervalId) {
          clearInterval(window.rhythmReaderGlobal.intervalId);
          window.rhythmReaderGlobal.intervalId = null;
          window.rhythmReaderGlobal.active = false;
        }
      }
    }
    
    // 更新状态
    setReadingMode(newMode);
    
    // 处理所有节奏阅读按钮的显示/隐藏
    const rhythmButtons = [
      document.getElementById('rhythm-reader-button'),
      document.getElementById('rhythm-start-button'),
      document.getElementById('rhythm-control-button')
    ];
    
    rhythmButtons.forEach(button => {
      if (button) {
        button.style.display = newMode === 'flash-reading' ? 'none' : 'block';
      }
    });
    
    // 如果有PDF文档和当前页，重新处理当前页内容
    if (pdfDocument && currentPage > 0) {
      try {
        console.log('重新处理当前页面内容');
        const page = await pdfDocument.getPage(currentPage);
        
        // 不使用任何额外处理，直接使用最原始的方式重新加载页面
        const textContent = await page.getTextContent();
        const textItems = textContent.items;
        let extractedText = textItems.map(item => item.str).join(' ');
        extractedText = extractedText.replace(/\s+/g, ' ').trim();
        
        // 分割成句子
        const sentences = splitIntoSentences(extractedText);
        
        // 根据当前模式设置内容
        if (newMode === 'static') {
          // 静态高亮模式 - 使用改进的句子处理
          const html = formatSimpleHighlightedText(sentences);
          console.log('设置静态高亮内容');
          setContent(html);
          
          // 添加延时验证检查
          setTimeout(() => {
            const contentArea = document.querySelector('.adhd-highlight-mode');
        if (contentArea) {
              console.log('静态高亮模式元素存在');
              const paragraphs = contentArea.querySelectorAll('.pdf-paragraph');
              console.log(`找到 ${paragraphs.length} 个段落`);
              
              // 检查样式是否正确应用
              if (paragraphs.length > 0) {
                const firstPara = paragraphs[0];
                const styles = window.getComputedStyle(firstPara);
                console.log('段落应用的样式:', {
                  color: styles.color,
                  backgroundColor: styles.backgroundColor,
                  fontFamily: styles.fontFamily,
                  fontSize: styles.fontSize
                });
                
                // 验证文字颜色
                if (styles.color === 'rgb(51, 51, 51)' || styles.color === '#333333') {
                  console.log('文字颜色正确应用');
                } else {
                  console.warn('文字颜色可能未正确应用:', styles.color);
                }
              }
            } else {
              console.error('未找到静态高亮模式内容区域');
            }
          }, 200);
        } else if (newMode === 'flash-reading') {
          try {
            const page = await pdfDocument.getPage(currentPage);
            const textContent = await page.getTextContent();
            const textItems = textContent.items;
            let extractedText = textItems.map(item => item.str).join(' ');
            extractedText = extractedText.replace(/\s+/g, ' ').trim();
            
            // 使用特定的闪读分割函数
            const segments = splitIntoFlashReadingSegments(extractedText);
            
            // 生成闪读内容
            const processedContent = createFlashReadingContentFromSentences(segments);
            setContent(processedContent);
            
            // 延迟初始化，确保DOM已更新
            setTimeout(() => {
              initializeFlashReading();
            }, 100);
          } catch (error) {
            console.error('应用闪读模式时出错:', error);
          }
        } else {
          // 其他模式保持不变
          const handler = getContentHandlerForMode(newMode);
          const processedContent = handler(sentences);
          setContent(processedContent);
        }
      } catch (error) {
        console.error('应用阅读模式失败:', error);
      }
    }
  };

  // 清理DOM元素和效果
  const cleanupDOM = () => {
    // 首先确保移除鼠标跟随监听器
    removeMouseFollowListeners();
    
    // 清理节奏阅读器
    if (window.rhythmReader) {
      window.rhythmReader.stop();
    }
    
    // 清理闪读器
    if (window.flashReader) {
      window.flashReader.cleanup();
      
      // 在退出闪读模式时恢复节奏阅读按钮
      const rhythmButton = document.getElementById('rhythm-reader-button');
      if (rhythmButton) {
        rhythmButton.style.display = 'block';
      }
    }
    
    // 清理舒适3D效果
    const comfortable3DElements = document.querySelectorAll('.emboss-3d-text, .float-3d-text, .gradient-3d-text');
    comfortable3DElements.forEach(el => el.remove());
    
    // 清理闪读模式元素
    const flashReadingElements = document.querySelectorAll('.flash-reading-container, .flash-reading-display, .flash-reading-controls');
    flashReadingElements.forEach(el => el.remove());
    
    // 移除所有可能的高亮元素
    const highlights = document.querySelectorAll(
      '.mouse-highlight, .line-highlight, .highlight-word, .reading-line, .text-line, .rhythm-char'
    );
    highlights.forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    
    // 彻底替换内容区域以移除所有事件监听器
    const contentArea = document.querySelector('.page-content');
    if (contentArea) {
      // 先保存底部翻页控件
      const bottomPagination = contentArea.querySelector('.bottom-pagination');
      
      // 深度克隆内容，但不克隆事件监听器
      const contentHTML = contentArea.querySelector('div[dangerouslySetInnerHTML]')?.innerHTML || '';
      const newContentArea = contentArea.cloneNode(false);
      
      // 创建新的内容容器
      const newContentContainer = document.createElement('div');
      newContentContainer.innerHTML = contentHTML;
      newContentArea.appendChild(newContentContainer);
      
      // 如果有底部翻页控件，重新添加
      if (bottomPagination && totalPages > 0) {
        const newBottomPagination = bottomPagination.cloneNode(true);
        // 重新绑定事件
        const prevBtn = newBottomPagination.querySelector('.page-btn:first-child');
        const nextBtn = newBottomPagination.querySelector('.page-btn:last-child');
        if (prevBtn) prevBtn.onclick = () => changePage(-1);
        if (nextBtn) nextBtn.onclick = () => changePage(1);
        newContentArea.appendChild(newBottomPagination);
      }
      
      if (contentArea.parentNode) {
        contentArea.parentNode.replaceChild(newContentArea, contentArea);
      }
    }
    
    // 重置段落结构
    const paragraphs = document.querySelectorAll('.pdf-paragraph');
    paragraphs.forEach(paragraph => {
      // 移除所有特殊标记和样式
      paragraph.removeAttribute('data-follow');
      paragraph.removeAttribute('style');
      
      // 清理特殊span标签
      paragraph.innerHTML = paragraph.innerHTML
        .replace(/<span class="text-line"[^>]*>/g, '')
        .replace(/<span class="rhythm-char"[^>]*>/g, '')
        .replace(/<span class="line-highlight[^"]*"[^>]*>/g, '')
        .replace(/<span class="mouse-highlight[^"]*"[^>]*>/g, '')
        .replace(/<\/span>/g, '');
    });
    
    // 移除特殊UI元素
    const elementsToRemove = [
      'rhythm-speed-slider',
      'rhythm-notification'
    ];
    
    elementsToRemove.forEach(id => {
      const element = document.getElementById(id);
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // 移除暗色背景
    document.body.classList.remove('dark-background');
    
    // 清理闪读模式
    if (window.flashReader && typeof window.flashReader.cleanup === 'function') {
      window.flashReader.cleanup();
    }
    
    // 根据当前阅读模式确定是否显示节奏阅读按钮
    const rhythmButton = document.getElementById('rhythm-reader-button');
    if (rhythmButton) {
      const currentMode = document.getElementById('reading-mode-select')?.value;
      rhythmButton.style.display = currentMode === 'flash-reading' ? 'none' : 'block';
    }
  };

  const handleAutoScroll = () => {
    window.autoReader.isScrolling = true;
    // ... 防抖动逻辑
  };

  const updateCursorPosition = (force = false) => {
    // ... 优化的位置更新和滚动逻辑
  };

  // 处理鼠标移动事件
  const handleMouseMove = (e) => {
    if (readingMode !== 'follow-mouse') return;
    
    const contentArea = document.querySelector('.page-content');
    if (!contentArea) return;
    
    const rect = contentArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    clearAllHighlights();
    
    const paragraphs = contentArea.querySelectorAll('p');
    paragraphs.forEach(paragraph => {
      const paragraphRect = paragraph.getBoundingClientRect();
      const paragraphX = paragraphRect.left - rect.left;
      const paragraphY = paragraphRect.top - rect.top;
      
      if (y >= paragraphY && y <= paragraphY + paragraphRect.height) {
        const words = paragraph.querySelectorAll('span');
        words.forEach(word => {
          const wordRect = word.getBoundingClientRect();
          const wordX = wordRect.left - rect.left;
          
          if (x >= wordX && x <= wordX + wordRect.width) {
            word.classList.add('highlight');
          }
        });
      }
    });
  };

  // 清理所有高亮
  const clearAllHighlights = () => {
    document.querySelectorAll('.line-highlight').forEach(el => el.remove());
  };

  // 专门用于移除鼠标跟随事件的函数
  const removeMouseFollowListeners = () => {
    // 移除记录的所有监听器
    if (window.eventTracker && window.eventTracker.mouseFollowHandlers) {
      window.eventTracker.mouseFollowHandlers.forEach(({element, event, handler}) => {
        if (element && element.removeEventListener) {
          element.removeEventListener(event, handler);
        }
      });
      window.eventTracker.mouseFollowHandlers = [];
    }
    
    // 为安全起见，尝试从document和内容区域移除通用处理函数
    const contentArea = document.querySelector('.page-content');
    if (contentArea) {
      contentArea.removeEventListener('mousemove', handleMouseMove);
      contentArea.removeEventListener('mouseleave', clearAllHighlights);
    }
    
    document.removeEventListener('mousemove', handleMouseMove);
    
    // 清除所有当前高亮
    clearAllHighlights();
  };

  // 添加自动阅读器样式
  const addAutoReaderStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
      }
      .speed-control {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0,0,0,0.7);
        padding: 10px;
        border-radius: 8px;
        color: white;
        z-index: 10000;
      }
      .speed-control button {
        margin: 0 5px;
        padding: 5px 10px;
        background: #4CAF50;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
    
    // 添加底部翻页控件样式
    const bottomPaginationStyles = document.createElement('style');
    bottomPaginationStyles.id = 'bottom-pagination-styles';
    bottomPaginationStyles.innerHTML = `
      .bottom-pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px 0 30px;
        margin-top: 30px;
        width: 100%;
        background-color: transparent;
        border-radius: 5px;
      }

      .bottom-pagination .page-btn {
        background-color: #6c5ce7;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 15px;
        margin: 0 10px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s ease;
      }

      .bottom-pagination .page-btn:hover {
        background-color: #4834d4;
      }

      .bottom-pagination .page-btn:disabled {
        background-color: #aaa;
        cursor: not-allowed;
      }

      .bottom-pagination .page-info {
        font-size: 14px;
        margin: 0 10px;
      }
    `;
    document.head.appendChild(bottomPaginationStyles);
  };

  // 在组件挂载时添加样式
  useEffect(() => {
    addAutoReaderStyles();
    addComfortable3DStyles();
    
    // 添加鼠标跟随模式的样式
    const mouseFollowStyle = document.createElement('style');
    mouseFollowStyle.id = 'intelligent-mouse-follow-style';
    mouseFollowStyle.textContent = `
      /* 基础样式 */
      .mouse-follow-content {
        position: relative;
        line-height: 1.8;
      }
      
      .mouse-follow-content .follow-line {
        position: relative;
        padding: 8px 16px;
        margin: 4px 0;
        border-radius: 6px;
        transition: all 0.2s ease;
        display: block;
        min-height: 1.8em;
        white-space: normal;
        word-wrap: break-word;
        text-indent: 2em;
      }
      
      /* 高亮状态 */
      .follow-line.highlighted {
        background-color: #ffa500 !important; /* 橙色背景 */
        color: #ffffff !important; /* 白色文字 */
        font-weight: bold !important;
        font-size: 1.1em; /* 稍微调小字号 */
        transform: translateX(5px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      
      /* 平滑过渡效果 */
      .follow-line {
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* 行间距优化 */
      .mouse-follow-content .follow-line + .follow-line {
        margin-top: 4px;
      }
      
      /* 添加行指示器 */
      .follow-line::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.5), transparent);
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      
      .follow-line.highlighted::before {
        opacity: 1;
      }
    `;
    document.head.appendChild(mouseFollowStyle);
    
    // 创建深色背景下的ADHD友好高亮样式
    const style = document.createElement('style');
    style.id = 'adhd-friendly-highlight-style';
    style.textContent = `
      /* ADHD友好的高亮样式 - 适配深色背景 */
      .adhd-highlight-mode {
        line-height: 1.8;
        padding: 20px;
      }
      
      .adhd-highlight-mode .pdf-paragraph {
        margin-bottom: 1.2em;
        background-color: transparent;
        padding: 12px 15px;
        border-radius: 6px;
        border-left: 3px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s ease;
      }

      .adhd-highlight-mode .pdf-paragraph:hover {
        transform: translateX(5px);
        border-left-color: rgba(255, 255, 255, 0.4);
      }
      
      /* 加粗样式 - 白色加粗 */
      .adhd-bold {
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.02em;
        font-size: 1.1em;
        text-shadow: 0 0 1px rgba(255, 255, 255, 0.2);
      }
      
      /* 彩色样式 - 使用鲜明的蓝色 */
      .adhd-colored {
        color: #6c5ce7;
        font-weight: 500;
        font-size: 1.05em;
        text-shadow: 0 0 1px rgba(108, 92, 231, 0.2);
      }
      
      /* 正常样式 - 普通白色 */
      .adhd-normal {
        color: rgba(255, 255, 255, 0.8);
        font-size: 1em;
      }

      /* 添加平滑过渡效果 */
      .adhd-bold, .adhd-colored, .adhd-normal {
        transition: all 0.2s ease;
      }

      /* 悬停效果 */
      .adhd-highlight-mode .pdf-paragraph:hover .adhd-bold {
        color: #ffffff;
        text-shadow: 0 0 2px rgba(255, 255, 255, 0.3);
      }

      .adhd-highlight-mode .pdf-paragraph:hover .adhd-colored {
        color: #8a7ff7;
        text-shadow: 0 0 2px rgba(138, 127, 247, 0.3);
      }

      .adhd-highlight-mode .pdf-paragraph:hover .adhd-normal {
        color: rgba(255, 255, 255, 0.9);
      }

      /* 添加段落间距的视觉引导 */
      .adhd-highlight-mode .pdf-paragraph + .pdf-paragraph {
        margin-top: 1.5em;
        position: relative;
      }
      
      .adhd-highlight-mode .pdf-paragraph + .pdf-paragraph::before {
        content: '';
        position: absolute;
        top: -0.75em;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(
          to right,
          transparent,
          rgba(255, 255, 255, 0.1),
          transparent
        );
      }
    `;
    document.head.appendChild(style);
    
    // 添加基础鼠标跟随样式
    const mouseFollowPageStyle = document.createElement('style');
    mouseFollowPageStyle.id = 'basic-mouse-follow-style';
    mouseFollowPageStyle.textContent = `
      .follow-line {
        padding: 8px 12px;
        margin: 4px 0;
        border-radius: 4px;
        transition: background-color 0.2s ease;
      }
      .follow-line.highlighted {
        background-color: #ffa500;
        color: #000080;
        font-weight: bold;
      }
    `;
    document.head.appendChild(mouseFollowPageStyle);
    
    return () => {
      const existingStyle = document.getElementById('adhd-friendly-highlight-style');
      if (existingStyle) existingStyle.remove();
      
      const existingMouseFollowStyle = document.getElementById('intelligent-mouse-follow-style');
      if (existingMouseFollowStyle) existingMouseFollowStyle.remove();
      
      const existingBasicMouseFollowStyle = document.getElementById('basic-mouse-follow-style');
      if (existingBasicMouseFollowStyle) existingBasicMouseFollowStyle.remove();
      
      mouseFollowPageStyle.remove();
    };
  }, []);

  // 初始化鼠标跟随模式
  const initializeMouseFollow = () => {
    // 清理旧监听器
    removeMouseFollowListeners();
    
    // 添加新监听器
    setTimeout(() => {
      addMouseFollowListeners();
      
      // 添加调试辅助 - 显示行边界
      const contentArea = document.querySelector('.mouse-follow-content');
      if (contentArea) {
        const lines = contentArea.querySelectorAll('.follow-line');
        console.log(`初始化鼠标跟随模式，共 ${lines.length} 行`);
        
        // 可选：启用可视化调试
        if (false) { // 设置为true可以启用可视化调试
          lines.forEach((line, index) => {
            line.style.border = '1px dashed #888';
            line.setAttribute('title', `行 ${index+1}`);
          });
        }
        
        // 验证行高亮效果
        const firstLine = lines[0];
        if (firstLine) {
          console.log('行样式验证:', {
            padding: window.getComputedStyle(firstLine).padding,
            margin: window.getComputedStyle(firstLine).margin,
            fontSize: window.getComputedStyle(firstLine).fontSize,
            lineHeight: window.getComputedStyle(firstLine).lineHeight
          });
        }
      }
    }, 100);
  };

  // 调整阅读速度
  const adjustSpeed = (delta) => {
    window.autoReader.speed = Math.max(100, window.autoReader.speed + delta);
    
    if (window.autoReader.intervalId) {
      stopAutoReader();
      startAutoReader();
    }
  };

  // 修改翻页函数
  const changePage = async (delta) => {
    // 添加安全检查，确保全局对象存在
    if (typeof window.rhythmReaderGlobal === 'undefined') {
      window.rhythmReaderGlobal = {
        active: false,
        speed: 150,
        pagesRead: 0,
        intervalId: null
      };
    }
    
    // 如果正在进行节奏阅读，先停止
    if (window.rhythmReader) {
      if (typeof window.rhythmReader.stop === 'function') {
        window.rhythmReader.stop();
      } else {
        // 如果stop函数不存在，尝试手动清理
        if (window.rhythmReader.intervalId) {
          clearInterval(window.rhythmReader.intervalId);
          window.rhythmReader.intervalId = null;
        }
        window.rhythmReader.active = false;
      }
    }
    
    // 继续原有的changePage逻辑
    console.log(`翻页请求: 当前页 ${currentPage}, 增量 ${delta}`);
    const newPage = currentPage + delta;
    
    if (newPage < 1 || newPage > totalPages) {
      console.log('无效页码，不执行翻页');
      return;
    }
    
    // 安全地检查阅读状态
    const wasRhythmReading = readingMode === 'rhythm' && 
      window.rhythmReaderGlobal && 
      window.rhythmReaderGlobal.active;
      
    const wasFlashReading = readingMode === 'flash-reading' && 
      window.flashReader && 
      window.flashReader.isPlaying;
    
    // 安全地停止节奏阅读
    if (wasRhythmReading && window.rhythmReader && typeof window.rhythmReader.stop === 'function') {
      window.rhythmReader.stop();
    }
    
    // 安全地停止闪读
    if (wasFlashReading && window.flashReader && typeof window.flashReader.cleanup === 'function') {
      window.flashReader.cleanup();
    }
    
    // 更新页码
    setCurrentPage(newPage);
    
    try {
      // 加载新页面
      const page = await pdfDocument.getPage(newPage);
      
      // 检查是否为目录页
      const textContent = await page.getTextContent();
      const isToc = await detectIfTocPage(textContent);
      setIsTableOfContents(isToc);
      
      if (isToc) {
        // 处理目录页面 - 保持原布局，仅调整字间距
        await processTocPage(textContent, page.getViewport({ scale: 1.0 }));
      } else {
        // 处理正文页面 - 根据当前阅读模式处理
      const textItems = textContent.items;
      let extractedText = textItems.map(item => item.str).join(' ');
      extractedText = extractedText.replace(/\s+/g, ' ').trim();
      
        // 分割成句子
        const sentences = splitIntoSentences(extractedText);
        
        // 根据当前模式设置内容
        if (readingMode === 'static') {
          console.log('翻页后应用静态高亮模式');
          const processedContent = formatSimpleHighlightedText(sentences);
          setContent(processedContent);
        } else if (readingMode === 'flash-reading') {
          // 使用特定的闪读分割函数
          const segments = splitIntoFlashReadingSegments(extractedText);
          
          // 生成闪读内容
          const processedContent = createFlashReadingContentFromSentences(segments);
          setContent(processedContent);
          
          // 延迟初始化，确保DOM已更新
          setTimeout(() => {
            initializeFlashReading();
          }, 100);
        } else {
          // 其他模式使用原处理函数
          await processContentPage(page, readingMode);
        }
      }
      
      // 在内容处理完成后，如果是鼠标跟随模式，添加监听器
      if (readingMode === 'follow-mouse') {
          setTimeout(() => {
          addMouseFollowListeners();
          }, 50);
      }
      
      // 如果之前在节奏阅读，自动重新开始
      if (wasRhythmReading) {
          setTimeout(() => {
          if (window.manualStartRhythmReading) {
            window.manualStartRhythmReading();
          }
        }, 1000);
      }
      
      // 如果之前在闪读，自动重新开始
      if (wasFlashReading) {
          setTimeout(() => {
          if (window.flashReader && typeof window.flashReader.start === 'function') {
            window.flashReader.start();
        }
        }, 1000);
      }
    } catch (error) {
      console.error('页面切换错误:', error);
    }
  };

  // ADHD友好的静态高亮处理函数
  const formatSimpleHighlightedText = (sentences) => {
    console.log('开始处理ADHD友好的静态高亮文本，句子数量:', sentences.length);
    
    let html = '<div class="pdf-content adhd-highlight-mode">';
    
    sentences.forEach((sentence, sentenceIndex) => {
      if (!sentence || sentence.trim() === '') {
        console.log(`跳过空句子，索引: ${sentenceIndex}`);
          return;
        }
        
      // 清理和规范化文本
      const cleanText = sentence
        .trim()
        .replace(/\s+/g, ' ')  // 规范化空白字符
        .replace(/&/g, '&amp;')  // 转义特殊字符
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // 处理句子中的单词，为它们添加不同样式
      const words = cleanText.split(/(\s+)/);
      let formattedSentence = '';
      
      words.forEach((word, wordIndex) => {
        if (word.trim() === '') {
          // 保留空格
          formattedSentence += word;
        } else {
          // 根据位置应用不同的样式类
          // 三种交替样式: 加粗、彩色、正常
          const styleClass = wordIndex % 3 === 0 ? 'adhd-bold' : 
                           wordIndex % 3 === 1 ? 'adhd-colored' : 'adhd-normal';
          
          formattedSentence += `<span class="${styleClass}">${word}</span>`;
        }
      });
      
      console.log(`处理句子 ${sentenceIndex + 1}:`, cleanText.substring(0, 50) + '...');
      html += `<p class="pdf-paragraph">${formattedSentence}</p>`;
    });
    
    html += '</div>';
    
    // 调试输出
    console.log('生成的ADHD友好静态高亮HTML:', html.substring(0, 200) + '...');
    
    return html;
  };

  // 根据阅读模式获取相应的内容处理函数
  const getContentHandlerForMode = (mode) => {
    switch(mode) {
      case 'normal': return formatSentencesToHtml;
      case 'static': return applyStaticHighlightToSentences;
      case 'follow-mouse': return formatSentencesForMouseFollow;
      case 'comfortable-3d': return applyComfortable3dEffectToSentences;
      case 'flash-reading': 
        return (sentences) => {
          // 闪读模式使用专门的分割函数重新处理文本
          return createFlashReadingContentFromSentences(sentences);
        };
      default: return formatSentencesToHtml;
    }
  };

  // 监听阅读模式和当前页面的变化
  useEffect(() => {
    if (readingMode === 'mouse-follow' && currentPage && !isTableOfContents) {
      // 移除之前的样式
      const oldStyle = document.getElementById('intelligent-mouse-follow-style');
      if (oldStyle) {
        oldStyle.remove();
      }
      
      // 添加基础鼠标跟随样式
      const followModeStyle = document.createElement('style');
      followModeStyle.id = 'basic-mouse-follow-style';
      followModeStyle.textContent = `
        .follow-line {
          padding: 8px 12px;
          margin: 4px 0;
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }
        .follow-line.highlighted {
          background-color: #ffa500;
          color: #000080;
        font-weight: bold;
        }
      `;
      document.head.appendChild(followModeStyle);
      
      // 处理当前页面内容
      const page = pdfDocument.getPage(currentPage);
      const textContent = page.getTextContent();
      const sentences = textContent.items
        .map(item => item.str)
        .join(' ')
        .split(/[。！？]/)
        .filter(s => s.trim());
      
      // 应用基础鼠标跟随格式化
      setContent(formatSentencesForMouseFollow(sentences));
      
      // 添加鼠标跟随监听器
      setTimeout(() => {
        addMouseFollowListeners();
      }, 100);
      
      return () => {
        followModeStyle.remove();
      };
    }
  }, [readingMode, currentPage, pdfDocument]);

  // 添加全局节奏阅读速度控制器
  (function() {
    console.log("初始化全局节奏阅读速度控制器");

    // 配置参数和状态变量
    let readingSpeed = 150; // 默认速度改为150ms，更快
    
    // 创建独立的速度滑块UI
    function createRhythmSpeedSlider() {
      console.log("创建节奏阅读速度控制器...");
      
      // 设置默认速度
      const defaultSpeed = 150;
      window.rhythmReadingSpeed = defaultSpeed;
      
      // 不创建UI元素，只设置全局速度控制功能
      window.rhythmReading = window.rhythmReading || {};
      window.rhythmReading.updateSpeed = function(newSpeed) {
        window.rhythmReadingSpeed = newSpeed;
        
        // 更新当前活动的节奏阅读实例
        if (window.rhythmReader && typeof window.rhythmReader.updateSpeed === 'function') {
          window.rhythmReader.updateSpeed(newSpeed);
          console.log("已更新rhythmReader速度");
        }
        
        // 查找全局作用域中的其他intervalId实例
        for (let key in window) {
          if (key.includes('rhythm') && key.includes('Interval') && window[key]) {
            try {
              clearInterval(window[key]);
              if (typeof window['nextChar'] === 'function') {
                window[key] = setInterval(window['nextChar'], newSpeed);
              } else if (typeof window['advanceChar'] === 'function') {
                window[key] = setInterval(window['advanceChar'], newSpeed);
              } else if (typeof window['moveToNextChar'] === 'function') {
                window[key] = setInterval(window['moveToNextChar'], newSpeed);
              }
              console.log("已更新", key, "的速度");
            } catch(e) {
              console.error("更新", key, "速度失败", e);
            }
          }
        }
      };
      
      console.log("节奏阅读速度控制器已初始化！");
    }
    
    // 页面加载完成后初始化速度控制
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(createRhythmSpeedSlider, 1000);
      });
    } else {
      setTimeout(createRhythmSpeedSlider, 1000);
    }
    
    // 暴露给全局，供其他脚本使用
    window.createRhythmSpeedSlider = createRhythmSpeedSlider;
    window.rhythmReadingSpeed = readingSpeed;
  })();

  // 纯手动节奏阅读模式 - 双按钮版
  (function() {
    // 避免重复初始化
    if (window.simpleRhythmReaderActive) {
      console.log("节奏阅读模式已经在运行中");
          return;
        }
        
    console.log("初始化纯手动节奏阅读模式 - 双按钮版");
    
    // 局部变量，避免全局污染
    let active = false;
    let readingSpeed = 150; // 默认速度
    let charElements = [];
    let currentIndex = 0;
    let readIndices = new Set();
    let intervalId = null;
    
    // 创建读完提示
    function showCompletionMessage() {
      // 停止阅读
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      
      const message = document.createElement('div');
      message.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 16px;
        z-index: 999999;
      `;
      message.textContent = "本页已读完，请手动翻页后点击右上角'开始阅读'继续";
      document.body.appendChild(message);
      
      setTimeout(() => {
        if (message.parentNode) {
          message.parentNode.removeChild(message);
        }
      }, 5000);
    }
    
    // 更新字符显示
    function updateDisplay() {
      charElements.forEach((span, index) => {
        if (index === currentIndex) {
          span.style.color = 'green';
          span.style.fontWeight = 'bold';
        } else if (readIndices.has(index)) {
          span.style.color = '';
        } else {
          span.style.color = 'rgba(200,200,200,0.3)';
        }
      });
    }
    
    // 字符处理函数
    function processNextChar() {
      if (!active || !charElements.length) return;
      
      readIndices.add(currentIndex);
      
      currentIndex++;
      if (currentIndex >= charElements.length) {
        active = false;
        showCompletionMessage();
        return;
      }
      
      updateDisplay();
      
      // 确保当前字符在视图内
      const currentChar = charElements[currentIndex];
      if (currentChar) {
        const rect = currentChar.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          currentChar.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    }
    
    // 清理函数
    function cleanup() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      
      active = false;
      
      try {
        // 恢复原始文本
        document.querySelectorAll('.rhythm-char').forEach(span => {
          if (span.parentNode) {
            span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
          }
        });
      } catch(e) {
        console.error("清理失败:", e);
      }
      
      // 清理控制面板
      const controller = document.getElementById('rhythm-reader-control');
      if (controller) controller.remove();
      
      // 清理速度控制器
      const speedSlider = document.getElementById('rhythm-speed-slider-container');
      if (speedSlider) speedSlider.remove();
      
      charElements = [];
      currentIndex = 0;
      readIndices.clear();
      
      // 重置全局标识
      window.simpleRhythmReaderActive = false;
    }
    
    // 启动阅读
    function startReading() {
      // 清理之前的状态
      cleanup();
      
      // 设置标识
      window.simpleRhythmReaderActive = true;
      
      // 查找文本内容
      const textNodes = [];
      const container = document.querySelector('article') || 
                        document.querySelector('main') || 
                        document.body;
      
      function findTextNodes(element) {
        if (!element) return;
        
        for (let i = 0; i < element.childNodes.length; i++) {
          const node = element.childNodes[i];
          if (node.nodeType === 3 && node.textContent.trim()) {
            textNodes.push(node);
          } else if (node.nodeType === 1 && 
                    !['SCRIPT', 'STYLE', 'NOSCRIPT', 'BUTTON', 'INPUT'].includes(node.tagName)) {
            findTextNodes(node);
          }
        }
      }
      
      findTextNodes(container);
      
      if (!textNodes.length) {
        console.log("未找到文本内容！");
        return;
      }
      
      // 处理文本节点
      textNodes.forEach(node => {
        if (!node.textContent.trim() || !node.parentNode) return;
        
        const fragment = document.createDocumentFragment();
        const text = node.textContent;
        
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const span = document.createElement('span');
          span.className = 'rhythm-char';
          span.textContent = char;
          fragment.appendChild(span);
          charElements.push(span);
        }
        
        node.parentNode.replaceChild(fragment, node);
      });
      
      if (!charElements.length) {
        console.log("处理文本失败！");
        return;
      }
      
      // 开始阅读
      active = true;
      currentIndex = 0;
      updateDisplay();
      intervalId = setInterval(processNextChar, readingSpeed);
    }
    
    // 初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startReading();
      });
    } else {
      startReading();
    }
  })();

  // 创建开始按钮
  function createStartButton() {
    if (document.getElementById('rhythm-reader-button')) return;
    
    const button = document.createElement('button');
    button.id = 'rhythm-reader-button';
    button.textContent = '开始节奏阅读';
    button.style.cssText = `
      position: fixed;
      right: 10px;
      top: 10px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 12px;
      z-index: 999999;
      cursor: pointer;
      font-size: 14px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      display: none;
    `;
    
    // 使用全局的节奏阅读函数
    button.onclick = () => {
      if (window.manualStartRhythmReading) {
        window.manualStartRhythmReading();
      }
    };
    
    document.body.appendChild(button);
    
    // 在添加按钮后立即检查当前模式
    const modeSelect = document.getElementById('reading-mode-select');
    if (modeSelect) {
      const currentMode = modeSelect.value;
      // 如果当前是闪读模式，保持隐藏；否则显示按钮
      button.style.display = currentMode === 'flash-reading' ? 'none' : 'block';
    }
    
    // 添加MutationObserver监听模式变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        const modeSelect = document.getElementById('reading-mode-select');
        if (modeSelect) {
          const currentMode = modeSelect.value;
          button.style.display = currentMode === 'flash-reading' ? 'none' : 'block';
        }
      });
    });
    
    // 开始观察模式选择器的变化
    if (modeSelect) {
      observer.observe(modeSelect, { attributes: true, attributeFilter: ['value'] });
    }
  }

  // 添加跳转到指定页面的函数
  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      showMessage(`请输入有效页码（1-${totalPages}）`, 2000);
      return;
    }
    
    const delta = pageNum - currentPage;
    changePage(delta);
    setJumpToPage(''); // 清空输入框
  };

  // 在组件开始时添加页面跳转相关的样式
  useEffect(() => {
    // 添加跳转框样式
    const styleElement = document.createElement('style');
    styleElement.id = 'page-jump-styles';
    styleElement.textContent = `
      .toolbar {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 15px 0;
        width: 100%;
      }
      
      .filename {
        color: white;
        font-size: 18px;
        font-weight: 500;
        margin: 0;
        text-align: center;
        opacity: 0.9;
        max-width: 80%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .bottom-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 15px;
        margin-top: 20px;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .page-jump {
        display: flex;
        align-items: center;
        margin-left: 15px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50px;
        padding: 3px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      
      .page-jump-input {
        width: 60px;
        text-align: center;
        border: none;
        background: transparent;
        color: white;
        font-size: 14px;
        padding: 8px 5px;
        outline: none;
        border-radius: 50px;
      }
      
      .page-jump-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
      
      .jump-btn {
        border-radius: 50px;
        margin-left: 0;
        padding: 8px 15px;
        font-size: 14px;
        min-width: 60px;
      }
      
      .welcome-message {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 70vh;
        color: white;
        font-size: 28px;
        font-weight: 300;
        text-align: center;
        opacity: 0.8;
        font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
        letter-spacing: 1px;
        text-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        animation: welcomeFadeIn 1.5s ease;
      }
      
      @keyframes welcomeFadeIn {
        from { opacity: 0; transform: translateY(-40px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .message-notification {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 50px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        text-align: center;
        animation: fadeIn 0.3s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      
      @media (max-width: 600px) {
        .bottom-pagination {
          flex-direction: column;
        }
        
        .page-jump {
          margin-left: 0;
          margin-top: 10px;
          width: 100%;
          justify-content: center;
        }
        
        .welcome-message {
          font-size: 20px;
          padding: 0 20px;
        }
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      const existingStyle = document.getElementById('page-jump-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // 清除消息超时
  useEffect(() => {
    return () => {
      if (messageTimeout) {
        clearTimeout(messageTimeout);
      }
    };
  }, [messageTimeout]);

  return (
    <div className="App">
      <div className="sidebar">
        <div className="logo">
          <h2>ADHD阅读助手</h2>
        </div>
        
        <div className="reading-controls">
          <h3>阅读模式</h3>
          <select 
            id="reading-mode-select" 
            value={readingMode} 
            onChange={handleReadingModeChange}
            className="mode-select"
          >
            <option value="normal">普通模式</option>
            <option value="static">静态高亮</option>
            <option value="follow-mouse">鼠标跟随</option>
            <option value="flash-reading">闪读模式</option>
          </select>
        </div>
        
        <div className="upload-section">
            <input 
            type="file"
            accept=".pdf,.txt,.md" 
            hidden
            id="file-upload"
            onChange={handleFileUpload}
            ref={fileRef}
          />
          <button 
            className="upload-btn"
            onClick={() => fileRef.current.click()}
          >
            上传文件 (.pdf)
          </button>
      </div>
          </div>
          
      <div className="main-content">
        {message && (
          <div className="message-notification">
            {message}
          </div>
        )}
        
        <div className="toolbar">
          {fileName && <h3 className="filename">{fileName}</h3>}
        </div>
          
        <div className="page-content" ref={readerContainerRef}>
            {totalPages === 0 ? (
              <div className="welcome-message">
                一起来开心地阅读吧！📚😊
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: content }} />
            )}
          
          {totalPages > 0 && (
            <div className="bottom-pagination">
              <button 
                onClick={() => changePage(-1)} 
                disabled={currentPage <= 1}
                className="page-btn"
              >
                上一页
              </button>
            <span className="page-info">
                第 {currentPage} / {totalPages} 页
              </span>
              <button 
                onClick={() => changePage(1)} 
                disabled={currentPage >= totalPages}
                className="page-btn"
              >
                下一页
              </button>
              
              <div className="page-jump">
                <input
                  type="text"
                  value={jumpToPage}
                  onChange={(e) => setJumpToPage(e.target.value)}
                  placeholder="页码"
                  className="page-jump-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleJumpToPage()}
                />
                <button 
                  onClick={handleJumpToPage}
                  className="page-btn jump-btn"
                >
                  跳转
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App; 

// 添加全局访问点，用于节奏阅读速度控制
(function setupRhythmReadingGlobals() {
  // 检查文档是否已加载
  const whenDocumentReady = (fn) => {
    if (document.readyState !== 'loading') {
      fn();
      } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  };
  
  whenDocumentReady(() => {
    // 创建全局命名空间
    window.rhythmReading = window.rhythmReading || {};
    
    // 尝试查找节奏阅读的nextChar函数和intervalId
    let foundNextChar = false;
    
    // 设置全局监听，捕获所有setInterval调用
    const originalSetInterval = window.setInterval;
    window.setInterval = function(fn, delay) {
      const intervalId = originalSetInterval.apply(this, arguments);
      
      // 检测是否为节奏阅读相关的interval
      if (fn.toString().includes('nextChar') || 
          fn.toString().includes('readIndices') || 
          fn.toString().includes('currentIndex++')) {
        console.log("捕获到节奏阅读interval:", intervalId);
        window.rhythmReading.activeIntervalId = intervalId;
        window.rhythmReading.nextCharFn = fn;
        window.rhythmReading.currentDelay = delay;
        foundNextChar = true;
      }
      
      return intervalId;
    };
    
    // 暴露更新速度的函数
    window.rhythmReading.updateSpeed = function(newSpeed) {
      if (window.rhythmReading.activeIntervalId) {
        clearInterval(window.rhythmReading.activeIntervalId);
        if (window.rhythmReading.nextCharFn) {
          window.rhythmReading.activeIntervalId = 
            setInterval(window.rhythmReading.nextCharFn, newSpeed);
          window.rhythmReading.currentDelay = newSpeed;
          console.log("节奏阅读速度已更新为:", newSpeed);
          return true;
        }
      }
      
      // 如果找不到活动的interval，尝试遍历所有可能的节奏阅读实例
      for (let key in window) {
        if (key.toLowerCase().includes('rhythm') && window[key]) {
          // 如果是对象且有updateSpeed方法
          if (typeof window[key] === 'object' && typeof window[key].updateSpeed === 'function') {
            try {
              window[key].updateSpeed(newSpeed);
              console.log("已更新", key, "的速度");
              return true;
            } catch(e) {
              console.error("更新", key, "速度失败", e);
            }
          }
        }
      }
      
      console.warn("未找到活动的节奏阅读实例");
      return false;
    };
    
    console.log("节奏阅读全局控制已设置");
  });
})(); 
