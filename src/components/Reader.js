import React, { useState, useEffect, useRef } from 'react';

const Reader = ({ content, isDarkMode }) => {
  const [readingMode, setReadingMode] = useState('highlight');
  const [autoReadingEnabled, setAutoReadingEnabled] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [pages, setPages] = useState([]);
  const contentRef = useRef(null);

  // 当content改变时，处理文本分页
  useEffect(() => {
    if (content) {
      // 将文本按段落分割
      const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
      
      // 将段落组合成页面（这里简单处理，每页3个段落）
      const pagesArray = [];
      for (let i = 0; i < paragraphs.length; i += 3) {
        pagesArray.push(paragraphs.slice(i, i + 3).join('\n\n'));
      }
      
      setPages(pagesArray);
      setCurrentPage(0); // 重置到第一页
      console.log('内容已分页:', pagesArray.length, '页'); // 调试用
    }
  }, [content]);

  // 将当前页面的文本分割成句子
  const sentences = pages[currentPage]?.split(/(?<=\.|\!|\?)\s+/) || [];

  // 自动阅读功能
  useEffect(() => {
    if (readingMode === 'dynamic' && autoReadingEnabled) {
      const timer = setInterval(() => {
        setCurrentSentenceIndex(prev => 
          prev < sentences.length - 1 ? prev + 1 : prev
        );
      }, 2000);

      return () => clearInterval(timer);
    }
  }, [autoReadingEnabled, readingMode, sentences]);

  return (
    <div className={`reader-container ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="reader-controls">
        <button onClick={() => setReadingMode('highlight')}>
          {readingMode === 'highlight' ? '✓ 静息高亮模式' : '静息高亮模式'}
        </button>
        <button onClick={() => setReadingMode('dynamic')}>
          {readingMode === 'dynamic' ? '✓ 动态阅读模式' : '动态阅读模式'}
        </button>
        {readingMode === 'dynamic' && (
          <button onClick={() => setAutoReadingEnabled(!autoReadingEnabled)}>
            {autoReadingEnabled ? '关闭自动阅读' : '开启自动阅读'}
          </button>
        )}
      </div>

      <div 
        ref={contentRef}
        className="reader-content"
      >
        {pages.length > 0 ? (
          readingMode === 'highlight' ? (
            <div className="content-text">
              {pages[currentPage].split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph.trim()}</p>
              ))}
            </div>
          ) : (
            <div className="content-text">
              {sentences.map((sentence, index) => (
                <span
                  key={index}
                  className={`sentence ${
                    autoReadingEnabled && index === currentSentenceIndex
                      ? 'active'
                      : index < currentSentenceIndex
                      ? 'read'
                      : 'unread'
                  }`}
                >
                  {sentence}{' '}
                </span>
              ))}
            </div>
          )
        ) : (
          <div className="no-content">正在加载内容...</div>
        )}
      </div>

      {pages.length > 0 && (
        <div className="page-navigation">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0}
          >
            上一页
          </button>
          <span className="page-info">
            第 {currentPage + 1} 页 / 共 {pages.length} 页
          </span>
          <button 
            onClick={() => setCurrentPage(prev => 
              Math.min(pages.length - 1, prev + 1)
            )}
            disabled={currentPage === pages.length - 1}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

export default Reader; 