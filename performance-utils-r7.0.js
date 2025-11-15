/* ========================================================================
   PERFORMANCE UTILITIES R7.0
   ========================================================================
   Các utility functions để tối ưu hiệu năng trên iPhone
   
   Features:
   - Debounce/Throttle search input
   - RequestAnimationFrame batch rendering
   - Memory-efficient DOM manipulation
   - Loading states
   
   Created: 2025-11-14
   ======================================================================== */

(function() {
    'use strict';

    // ======================================== 
    // DEBOUNCE FUNCTION
    // ======================================== 
    /**
     * Debounce - Trì hoãn thực thi function cho đến khi ngừng gọi
     * Dùng cho search input
     */
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ======================================== 
    // THROTTLE FUNCTION
    // ======================================== 
    /**
     * Throttle - Giới hạn số lần thực thi function trong 1 khoảng thời gian
     * Dùng cho scroll events
     */
    function throttle(func, limit = 100) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ======================================== 
    // BATCH DOM UPDATES
    // ======================================== 
    /**
     * Batch DOM updates using requestAnimationFrame
     * Giảm reflow/repaint
     */
    function batchDOMUpdates(callback) {
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(callback);
        } else {
            setTimeout(callback, 16); // ~60fps fallback
        }
    }

    // ======================================== 
    // CHUNK ARRAY PROCESSING
    // ======================================== 
    /**
     * Xử lý mảng lớn thành các chunks nhỏ
     * Tránh block UI thread
     */
    function processArrayInChunks(array, chunkSize, processChunk, onComplete) {
        let index = 0;
        
        function processNextChunk() {
            const chunk = array.slice(index, index + chunkSize);
            
            if (chunk.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            
            processChunk(chunk, index);
            index += chunkSize;
            
            // Schedule next chunk
            batchDOMUpdates(processNextChunk);
        }
        
        processNextChunk();
    }

    // ======================================== 
    // SHOW LOADING STATE
    // ======================================== 
    /**
     * Hiển thị loading overlay
     */
    function showLoading(message = '読み込み中... | Đang tải...') {
        const existing = document.getElementById('perf-loading-overlay');
        if (existing) return; // Already showing

        const overlay = document.createElement('div');
        overlay.id = 'perf-loading-overlay';
        overlay.className = 'perf-loading-overlay';
        overlay.innerHTML = `
            <div class="perf-loading-content">
                <div class="perf-spinner"></div>
                <div class="perf-loading-text">${message}</div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Prevent scroll when loading
        document.body.style.overflow = 'hidden';
    }

    /**
     * Ẩn loading overlay
     */
    function hideLoading() {
        const overlay = document.getElementById('perf-loading-overlay');
        if (overlay) {
            overlay.remove();
            document.body.style.overflow = '';
        }
    }

    // ======================================== 
    // LAZY IMAGE LOADING
    // ======================================== 
    /**
     * Lazy load images using Intersection Observer
     */
    function setupLazyImages() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const src = img.dataset.src;
                        
                        if (src) {
                            img.src = src;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            }, {
                rootMargin: '50px 0px', // Load 50px before visible
                threshold: 0.01
            });

            // Observe all images with data-src
            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
            
            return imageObserver;
        }
        
        // Fallback for browsers without IntersectionObserver
        document.querySelectorAll('img[data-src]').forEach(img => {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        });
        
        return null;
    }

    // ======================================== 
    // MEMORY MANAGEMENT
    // ======================================== 
    /**
     * Clear unused DOM nodes to free memory
     */
    function clearUnusedNodes(container) {
        if (!container) return;
        
        // Remove event listeners before clearing
        const elements = container.querySelectorAll('*');
        elements.forEach(el => {
            const clone = el.cloneNode(true);
            el.parentNode?.replaceChild(clone, el);
        });
        
        // Clear innerHTML
        container.innerHTML = '';
    }

    // ======================================== 
    // CACHE MANAGER
    // ======================================== 
    const CacheManager = {
        cache: new Map(),
        maxSize: 100, // Maximum cache entries
        
        set(key, value) {
            // Remove oldest if exceeding max size
            if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            
            this.cache.set(key, {
                value: value,
                timestamp: Date.now()
            });
        },
        
        get(key, maxAge = 5 * 60 * 1000) { // Default 5 minutes
            const cached = this.cache.get(key);
            
            if (!cached) return null;
            
            // Check if expired
            if (Date.now() - cached.timestamp > maxAge) {
                this.cache.delete(key);
                return null;
            }
            
            return cached.value;
        },
        
        clear() {
            this.cache.clear();
        },
        
        has(key) {
            return this.cache.has(key);
        }
    };

    // ======================================== 
    // VIRTUAL SCROLLING HELPER
    // ======================================== 
    /**
     * Calculate visible items for virtual scrolling
     */
    function getVisibleRange(scrollTop, itemHeight, containerHeight, totalItems, buffer = 5) {
        const start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
        const visibleCount = Math.ceil(containerHeight / itemHeight) + buffer * 2;
        const end = Math.min(totalItems, start + visibleCount);
        
        return { start, end, visibleCount };
    }

    // ======================================== 
    // EXPORT TO GLOBAL
    // ======================================== 
    window.PerformanceUtils = {
        debounce,
        throttle,
        batchDOMUpdates,
        processArrayInChunks,
        showLoading,
        hideLoading,
        setupLazyImages,
        clearUnusedNodes,
        CacheManager,
        getVisibleRange
    };

    console.log('[PerformanceUtils] R7.0 initialized ⚡');

})();
