
'use strict';

// --- アプリケーションの状態 ---
let currentDate = new Date();
// ラベルデータ構造: { id, date, text, top, left, style: { color, backgroundColor, fontSize, fontWeight, fontStyle } }
let labels = []; 
// テンプレートデータ構造: { id, text, style: { ... } }
let templates = [];
let currentId = '';
let activeLabelInfo = null; // { type, id?, date?, text?, top?, left?, style? }
let clipboard = null; // { text, style }
let dragInfo = null; // { id, element, offsetX, offsetY, hasMoved, startX, startY }
let defaultStyle = {
    color: '#333333',
    backgroundColor: '#fffbe6',
    fontSize: '13',
    fontWeight: 'normal',
    fontStyle: 'normal',
};
let isDatePickerVisible = false;
let datePickerYear = new Date().getFullYear();
let isTemplatePopoverVisible = false;
let selectedTemplateId = null;
let isWheeling = false; // For wheel throttling

const LOCAL_STORAGE_KEY = 'calendar-annotator-data';

// --- DOM要素 ---
const root = document.getElementById('root');
const popover = document.getElementById('popover');
const templatePopoverContainer = document.getElementById('template-popover-container');

// --- Data Persistence ---
const saveDataToLocalStorage = () => {
    try {
        const data = { labels, templates, currentId };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Failed to save data to localStorage:", e);
    }
};

const loadDataFromLocalStorage = () => {
    try {
        const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            labels = parsedData.labels || [];
            templates = parsedData.templates || [];
            currentId = parsedData.currentId || '';
        }
    } catch (e) {
        console.error("Failed to load or parse data from localStorage:", e);
        labels = [];
        templates = [];
        currentId = '';
    }
};

// --- Helper Functions ---
const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const getLabelStyle = (styleObj) => {
    if (!styleObj) return '';
    return `
        color: ${styleObj.color}; 
        background-color: ${styleObj.backgroundColor}; 
        font-size: ${styleObj.fontSize}px; 
        font-weight: ${styleObj.fontWeight}; 
        font-style: ${styleObj.fontStyle};
    `;
}

// --- Popover Functions ---
const showPopover = (targetElement) => {
    if (!activeLabelInfo) return;

    const rect = targetElement.getBoundingClientRect();
    popover.style.top = `${rect.top}px`;
    popover.style.left = `${rect.right + 8}px`; // ラベルの右横に表示
    
    let buttonsHtml = '';
    if (activeLabelInfo.type === 'new') {
        const pasteButtonDisabled = !clipboard ? 'disabled' : '';
        buttonsHtml = `
            <button class="popover-btn" data-action="save">決定</button>
            <button class="popover-btn" data-action="paste" ${pasteButtonDisabled}>貼付</button>
            <button class="popover-btn" data-action="recall">呼出</button>
            <button class="popover-btn" data-action="cancel">取消</button>
        `;
    } else { // 'existing'
        buttonsHtml = `
            <button class="popover-btn" data-action="update">決定</button>
            <button class="popover-btn" data-action="duplicate">複写</button>
            <button class="popover-btn" data-action="recall">呼出</button>
            <button class="popover-btn" data-action="save-template">テンプレ保存</button>
            <button class="popover-btn" data-action="delete">削除</button>
        `;
    }
    popover.innerHTML = buttonsHtml;
    popover.style.display = 'flex';
};

const hidePopover = () => {
    if(activeLabelInfo) {
        activeLabelInfo = null;
        render();
    }
    popover.style.display = 'none';
};

// --- Decoration Bar Functions ---
const updateDecorationBar = () => {
    const currentStyle = activeLabelInfo?.style || defaultStyle;

    document.getElementById('text-color-picker').value = currentStyle.color;
    document.getElementById('label-color-picker').value = currentStyle.backgroundColor;
    const fontSizeSlider = document.getElementById('font-size-slider');
    fontSizeSlider.value = currentStyle.fontSize;
    document.getElementById('font-size-value').textContent = currentStyle.fontSize;
    
    document.getElementById('bold-btn').classList.toggle('active', currentStyle.fontWeight === 'bold');
    document.getElementById('italic-btn').classList.toggle('active', currentStyle.fontStyle === 'italic');
};

const handleDecorationChange = (e) => {
    const target = e.target.closest('[data-style]');
    if (!target) return;

    const styleProp = target.dataset.style;
    let value = target.value;

    const isToggleButton = target.tagName === 'BUTTON';
    const targetStyle = activeLabelInfo?.style || defaultStyle;

    if (isToggleButton) {
        const currentVal = targetStyle[styleProp];
        if (styleProp === 'fontWeight') value = currentVal === 'bold' ? 'normal' : 'bold';
        if (styleProp === 'fontStyle') value = currentVal === 'italic' ? 'normal' : 'italic';
    }

    targetStyle[styleProp] = value;

    if (activeLabelInfo) {
        const activeLabelEl = document.querySelector('.label.editing');
        if (activeLabelEl) {
             if(styleProp === 'fontSize') {
                activeLabelEl.style.fontSize = `${value}px`;
                document.getElementById('font-size-value').textContent = value;
            } else if (styleProp === 'fontWeight' || styleProp === 'fontStyle' || styleProp === 'color' || styleProp === 'backgroundColor') {
                activeLabelEl.style[target.dataset.cssProp] = value;
            }
        }
    } else {
         if (styleProp === 'fontSize') {
            document.getElementById('font-size-value').textContent = value;
        }
    }
    updateDecorationBar();
};

// --- イベントハンドラ ---
const toggleDatePicker = () => {
    isDatePickerVisible = !isDatePickerVisible;
    if (isDatePickerVisible) {
        datePickerYear = currentDate.getFullYear();
    }
    render();
};

const handleDatePickerClick = (e) => {
    const target = e.target;
    const monthBtn = target.closest('.month-btn');
    
    if (target.closest('#prev-year-btn')) {
        datePickerYear--;
        render();
    } else if (target.closest('#next-year-btn')) {
        datePickerYear++;
        render();
    } else if (monthBtn) {
        const month = monthBtn.dataset.month;
        currentDate = new Date(datePickerYear, parseInt(month, 10), 1);
        isDatePickerVisible = false;
        render();
    } else if (target.closest('#date-picker-today-btn')) {
        currentDate = new Date();
        isDatePickerVisible = false;
        render();
    }
};

const handleYearInputChange = (e) => {
    const year = parseInt(e.target.value, 10);
    if (!isNaN(year) && String(year).length >= 4) {
         datePickerYear = year;
         render();
    }
};

const handleCalendarClick = (e) => {
    if (dragInfo && dragInfo.hasMoved) return;

    const clickedLabelEl = e.target.closest('.label');
    const clickedCellEl = e.target.closest('.date-cell');

    if (e.target.closest('#popover') || e.target.closest('.decoration-bar') || e.target.closest('.date-picker-container') || e.target.closest('.template-popover-backdrop')) {
        return;
    }
    
    if (clickedCellEl && clickedCellEl.classList.contains('other-month')) {
        const dateStr = clickedCellEl.dataset.date;
        const [year, month, day] = dateStr.split('-').map(Number);
        currentDate = new Date(year, month - 1, day);
        if (activeLabelInfo) hidePopover();
        render();
        return;
    }

    if (clickedLabelEl || clickedCellEl) {
        e.stopPropagation();
    }

    const wasEditing = !!activeLabelInfo;
    if (wasEditing && activeLabelInfo.id !== Number(clickedLabelEl?.dataset.id)) {
        hidePopover();
    }

    if (clickedLabelEl) {
        const labelId = Number(clickedLabelEl.dataset.id);
        if (activeLabelInfo?.id === labelId) return;
        
        const labelData = labels.find(l => l.id === labelId);
        activeLabelInfo = { type: 'existing', id: labelId, style: { ...labelData.style } };
        render(); 
        
        setTimeout(() => {
            const activeLabelEl = document.querySelector(`.label[data-id="${labelId}"]`);
            if (activeLabelEl) {
                activeLabelEl.focus();
                showPopover(activeLabelEl);
            }
        }, 0);

    } else if (clickedCellEl) {
        if (activeLabelInfo?.type === 'new') return;
        
        const dateStr = clickedCellEl.dataset.date;
        const labelsOnDate = labels.filter(l => l.date === dateStr).length;
        activeLabelInfo = {
            type: 'new',
            date: dateStr,
            text: '新規ラベル',
            top: 5 + labelsOnDate * 28,
            left: 5,
            style: { ...defaultStyle }
        };
        render();

        setTimeout(() => {
            const newLabelEl = document.getElementById('temp-new-label');
            if (newLabelEl) {
                newLabelEl.focus();
                document.execCommand('selectAll', false, null);
                showPopover(newLabelEl);
            }
        }, 0);
    }
    updateDecorationBar();
};

const handlePopoverAction = (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    
    const activeLabelEl = document.querySelector('.label.editing');

    switch(action) {
        case 'save':
            if (activeLabelInfo?.type === 'new' && activeLabelEl) {
                const newLabel = {
                    id: Date.now(),
                    date: activeLabelInfo.date,
                    text: activeLabelEl.innerText.trim() || '新規ラベル',
                    top: activeLabelInfo.top,
                    left: activeLabelInfo.left,
                    style: activeLabelInfo.style
                };
                labels.push(newLabel);
            }
            break;
        case 'update':
            if (activeLabelInfo?.type === 'existing' && activeLabelEl) {
                const label = labels.find(l => l.id === activeLabelInfo.id);
                if (label) {
                    label.text = activeLabelEl.innerText.trim();
                    label.style = activeLabelInfo.style;
                }
            }
            break;
        case 'delete':
            if (activeLabelInfo?.type === 'existing') {
                labels = labels.filter(l => l.id !== activeLabelInfo.id);
            }
            break;
        case 'duplicate':
            if (activeLabelInfo?.type === 'existing') {
                const labelToCopy = labels.find(l => l.id === activeLabelInfo.id);
                if (labelToCopy) {
                    clipboard = { text: labelToCopy.text, style: { ...labelToCopy.style } };
                }
            }
            break;
        case 'paste':
            if (activeLabelInfo && clipboard) {
                activeLabelInfo.text = clipboard.text;
                activeLabelInfo.style = { ...clipboard.style };
                render(); // Re-render to show pasted content immediately
                 setTimeout(() => {
                    const newLabelEl = document.querySelector('.label.editing');
                    if (newLabelEl) {
                        newLabelEl.focus();
                        showPopover(newLabelEl);
                    }
                }, 0);
            }
            return; // Do not hide popover yet
        case 'save-template':
            if (activeLabelInfo?.type === 'existing') {
                const labelToSave = labels.find(l => l.id === activeLabelInfo.id);
                 if (labelToSave) {
                    const newTemplate = {
                        id: Date.now(),
                        text: activeLabelEl.innerText.trim(),
                        style: { ...activeLabelInfo.style }
                    };
                    templates.push(newTemplate);
                    alert('テンプレートとして保存しました。');
                }
            }
            break;
        case 'recall':
             isTemplatePopoverVisible = true;
             render();
             return; // Do not hide popover yet
        case 'cancel':
            break;
    }
    
    activeLabelInfo = null;
    popover.style.display = 'none';
    
    saveDataToLocalStorage();
    render();
    updateDecorationBar();
};

const handleDocumentClick = (e) => {
    if (popover.contains(e.target) || 
        e.target.closest('.label.editing') || 
        e.target.closest('.decoration-bar') ||
        e.target.closest('.template-popover-modal')) {
        return;
    }
    
    if (activeLabelInfo) {
        hidePopover();
        updateDecorationBar();
    }

    if (isDatePickerVisible && !e.target.closest('.date-picker-container')) {
        isDatePickerVisible = false;
        render();
    }
};

const handleCalendarWheel = (e) => {
    e.preventDefault();
    if (isWheeling) return;
    isWheeling = true;

    if (e.deltaY < 0) {
        currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    if(activeLabelInfo) hidePopover();
    render();

    setTimeout(() => {
        isWheeling = false;
    }, 100);
};

// --- Drag and Drop Handlers ---
const handleDragStart = (e) => {
    const labelEl = e.target.closest('.label');
    if (!labelEl || labelEl.isContentEditable) return;

    hidePopover();

    const rect = labelEl.getBoundingClientRect();
    
    dragInfo = {
        id: Number(labelEl.dataset.id),
        element: labelEl,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
    };

    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', handleDragEnd, { once: true });
};

const handleDragging = (e) => {
    if (!dragInfo) return;

    if (!dragInfo.hasMoved) {
        const dx = e.clientX - dragInfo.startX;
        const dy = e.clientY - dragInfo.startY;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;

        dragInfo.hasMoved = true;
        const labelEl = dragInfo.element;
        const computedStyle = window.getComputedStyle(labelEl);
        const width = computedStyle.width;
        
        labelEl.classList.add('dragging');
        labelEl.style.width = width;
        
        document.body.appendChild(labelEl);
    }

    dragInfo.element.style.top = `${e.clientY - dragInfo.offsetY}px`;
    dragInfo.element.style.left = `${e.clientX - dragInfo.offsetX}px`;
};

const handleDragEnd = (e) => {
    if (!dragInfo) return;

    const wasDragging = dragInfo.hasMoved;
    const draggedEl = dragInfo.element;

    document.removeEventListener('mousemove', handleDragging);

    if (!wasDragging) {
        dragInfo = null;
        // The click event will handle this case
        // handleCalendarClick(e);
        return;
    }
    
    draggedEl.style.visibility = 'hidden';
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    draggedEl.style.visibility = 'visible';
    
    const targetCell = elementBelow?.closest('.date-cell');

    if (targetCell) {
        const newDate = targetCell.dataset.date;
        const labelsContainer = targetCell.querySelector('.labels-container');
        const containerRect = labelsContainer.getBoundingClientRect();
        
        const newTop = e.clientY - containerRect.top - dragInfo.offsetY;
        const newLeft = e.clientX - containerRect.left - dragInfo.offsetX;

        const labelToUpdate = labels.find(l => l.id === dragInfo.id);
        if (labelToUpdate) {
            labelToUpdate.date = newDate;
            labelToUpdate.top = Math.max(0, newTop);
            labelToUpdate.left = Math.max(0, newLeft);
        }
    }
    
    draggedEl.remove();
    dragInfo = null;
    saveDataToLocalStorage();
    render(); 
};

// --- Data I/O Handlers ---
const handleNew = () => {
    if (labels.length > 0 && !confirm('現在のラベルをすべてクリアして、新規作成しますか？\n保存していない変更は失われます。')) {
        return;
    }
    labels = [];
    templates = [];
    currentId = '';
    saveDataToLocalStorage();
    render();
};

const handleSaveFile = () => {
    const idInput = document.getElementById('calendar-id');
    currentId = idInput.value.trim();

    if (!currentId) {
        alert('IDを入力してください。');
        idInput.focus();
        return;
    }
    
    const filename = `${currentId}.json`;
    
    // Save both labels and templates
    const dataToSave = { labels, templates };
    const dataStr = JSON.stringify(dataToSave, null, 2);
    const dataBlob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const handleImport = () => {
    const fileInput = document.getElementById('file-importer');
    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const importedJson = JSON.parse(event.target.result);
                // Check if the file contains the new structure {labels, templates} or just an array (old format)
                if (Array.isArray(importedJson)) {
                     labels = importedJson;
                     templates = []; // Reset templates for old format files
                } else if (importedJson && Array.isArray(importedJson.labels)) {
                    labels = importedJson.labels;
                    templates = importedJson.templates || [];
                } else {
                    throw new Error('JSONの形式が正しくありません。');
                }

                const fileName = file.name;
                currentId = fileName.lastIndexOf('.') > 0 ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
                
                saveDataToLocalStorage();
                render();
                alert('データを正常に読み込みました。');
            } catch (error) {
                alert(`エラー: ファイルの読み込みに失敗しました。\n${error.message}`);
            } finally {
                fileInput.value = '';
            }
        };
        reader.readAsText(file);
    };
    fileInput.click();
};

// --- レンダリング関数 ---
const renderDatePickerPopover = () => {
    const monthNames = [...Array(12).keys()].map(i => `${i + 1}月`);
    const currentSelectedMonth = currentDate.getFullYear() === datePickerYear ? currentDate.getMonth() : -1;

    const monthButtonsHtml = monthNames.map((month, index) => `
        <button 
            class="month-btn ${index === currentSelectedMonth ? 'active' : ''}" 
            data-month="${index}">
            ${month}
        </button>
    `).join('');

    return `
    <div id="date-picker-popover">
        <div class="date-picker-header">
            <button id="prev-year-btn" aria-label="前の年">＜</button>
            <input type="number" id="year-input" value="${datePickerYear}" aria-label="年を入力">
            <button id="next-year-btn" aria-label="次の年">＞</button>
        </div>
        <div class="month-grid" role="group">
            ${monthButtonsHtml}
        </div>
        <div class="date-picker-footer">
            <button id="date-picker-today-btn">今日</button>
        </div>
    </div>
    `;
}

const handleTemplatePopoverAction = (e) => {
    e.stopPropagation(); // Stop event from bubbling to backdrop
    const target = e.target;
    const action = target.dataset.action;
    const templateItem = target.closest('.template-list-item');

    if (templateItem) {
        selectedTemplateId = Number(templateItem.dataset.id);
        renderTemplatePopover(); // Re-render to show selection
        return;
    }

    if (!action) return;

    switch (action) {
        case 'select':
            if (activeLabelInfo && selectedTemplateId) {
                const template = templates.find(t => t.id === selectedTemplateId);
                if (template) {
                    activeLabelInfo.text = template.text;
                    activeLabelInfo.style = { ...template.style };
                }
            }
            isTemplatePopoverVisible = false;
            selectedTemplateId = null;
            render();
            // After re-rendering the main view, re-focus and show the main popover
            setTimeout(() => {
                const activeLabelEl = document.querySelector('.label.editing');
                if (activeLabelEl) {
                    activeLabelEl.focus();
                    showPopover(activeLabelEl);
                }
            }, 0);
            break;
        case 'delete':
             if (selectedTemplateId) {
                templates = templates.filter(t => t.id !== selectedTemplateId);
                selectedTemplateId = null;
                saveDataToLocalStorage();
                renderTemplatePopover();
             }
            break;
        case 'close':
            isTemplatePopoverVisible = false;
            selectedTemplateId = null;
            render();
            break;
    }
};

const renderTemplatePopover = () => {
    if (!isTemplatePopoverVisible) {
        templatePopoverContainer.innerHTML = '';
        return;
    }

    let listContent = '';
    if (templates.length > 0) {
        listContent = templates.map(template => `
            <li class="template-list-item ${template.id === selectedTemplateId ? 'selected' : ''}" 
                data-id="${template.id}" 
                style="${getLabelStyle(template.style)}">
                ${template.text}
            </li>
        `).join('');
    } else {
        listContent = '<div class="template-list-placeholder">保存されたテンプレートはありません。</div>';
    }

    const popoverHtml = `
        <div class="template-popover-backdrop">
            <div class="template-popover-modal">
                <ul class="template-list">
                   ${listContent}
                </ul>
                <div class="template-popover-actions">
                     <button class="popover-btn" data-action="select" ${!selectedTemplateId ? 'disabled' : ''}>選択</button>
                     <button class="popover-btn" data-action="delete" ${!selectedTemplateId ? 'disabled' : ''}>削除</button>
                     <button class="popover-btn" data-action="close">閉じる</button>
                </div>
            </div>
        </div>
    `;

    templatePopoverContainer.innerHTML = popoverHtml;
    templatePopoverContainer.querySelector('.template-popover-backdrop').addEventListener('click', (e) => {
        // Only close if backdrop itself is clicked
        if (e.target === e.currentTarget) {
            isTemplatePopoverVisible = false;
            selectedTemplateId = null;
            render();
        }
    });
    templatePopoverContainer.querySelector('.template-popover-modal').addEventListener('click', handleTemplatePopoverAction);
};

const render = () => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());

  const endDate = new Date(lastDayOfMonth);
  endDate.setDate(endDate.getDate() + (6 - lastDayOfMonth.getDay()));

  const dates = [];
  let currentDatePointer = new Date(startDate);
  while (currentDatePointer <= endDate) {
    dates.push(new Date(currentDatePointer));
    currentDatePointer.setDate(currentDatePointer.getDate() + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
  const dayHeadersHtml = dayHeaders.map((day, index) => `
    <div class="day-header ${index === 0 ? 'sunday' : ''} ${index === 6 ? 'saturday' : ''}" role="columnheader">
      ${day}
    </div>
  `).join('');

  const dateCellsHtml = dates.map(date => {
    const isOtherMonth = date.getMonth() !== month;
    const isToday = date.getTime() === today.getTime();
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;

    const cellClasses = ['date-cell', isOtherMonth ? 'other-month' : ''].filter(Boolean).join(' ');
    const numberClasses = ['date-number', isToday ? 'today' : '', !isToday && isSunday ? 'sunday' : '', !isToday && isSaturday ? 'saturday' : ''].filter(Boolean).join(' ');

    const dateStr = formatDate(date);
    const labelsForDate = labels.filter(label => label.date === dateStr);
    let labelsHtml = labelsForDate.map(label => {
        const isEditing = activeLabelInfo?.type === 'existing' && activeLabelInfo.id === label.id;
        const classes = `label ${isEditing ? 'editing' : ''}`;
        const style = getLabelStyle(label.style);
        return `
        <div class="${classes}"
             contenteditable="${isEditing}"
             data-id="${label.id}"
             style="top: ${label.top}px; left: ${label.left}px; ${style}"
        >${label.text}</div>
        `;
    }).join('');
    
    if (activeLabelInfo?.type === 'new' && activeLabelInfo.date === dateStr) {
        const style = getLabelStyle(activeLabelInfo.style);
        labelsHtml += `
        <div class="label editing"
             id="temp-new-label"
             contenteditable="true"
             style="top: ${activeLabelInfo.top}px; left: ${activeLabelInfo.left}px; ${style}"
        >${activeLabelInfo.text}</div>
        `;
    }

    return `
      <div class="${cellClasses}" data-date="${dateStr}">
        <div class="${numberClasses}">${date.getDate()}</div>
        <div class="labels-container">${labelsHtml}</div>
      </div>
    `;
  }).join('');

  const appHtml = `
    <div class="app-container">
      <header class="header">
        <div class="header-top">
          <div class="date-picker-container">
            <button id="date-picker-trigger" class="header-title-btn" aria-haspopup="true" aria-expanded="${isDatePickerVisible}">
              ${year}年 ${month + 1}月
            </button>
            ${isDatePickerVisible ? renderDatePickerPopover() : ''}
          </div>
          <div class="header-controls">
            <div class="id-control">
              <label for="calendar-id">ID:</label>
              <input type="text" id="calendar-id" placeholder="スケジュール名を入力">
            </div>
            <div class="data-ops">
               <button id="new-btn">新規</button>
               <button id="save-btn">保存</button>
               <button id="import-btn">読込</button>
            </div>
          </div>
        </div>
        <div class="decoration-bar">
          <div class="deco-control">
            <label for="text-color-picker">文字色</label>
            <input type="color" id="text-color-picker" data-style="color" data-css-prop="color">
          </div>
          <div class="deco-control">
            <label for="label-color-picker">ラベル色</label>
            <input type="color" id="label-color-picker" data-style="backgroundColor" data-css-prop="backgroundColor">
          </div>
          <div class="deco-control">
            <label for="font-size-slider">文字大きさ</label>
            <input type="range" id="font-size-slider" min="10" max="24" step="1" data-style="fontSize" data-css-prop="fontSize">
            <span id="font-size-value" class="font-size-value">13</span>
          </div>
          <div class="deco-control style-btn-group">
            <button id="bold-btn" data-style="fontWeight" data-css-prop="fontWeight"><b>B</b></button>
            <button id="italic-btn" data-style="fontStyle" data-css-prop="fontStyle"><i>I</i></button>
          </div>
        </div>
      </header>
      <main class="calendar-board" id="calendar-board" aria-label="カレンダー">
        <div class="calendar-grid" id="calendar-grid">
          ${dayHeadersHtml}
          ${dateCellsHtml}
        </div>
      </main>
    </div>
  `;

  root.innerHTML = appHtml;

  // --- イベントリスナーの登録 ---
  document.getElementById('date-picker-trigger').addEventListener('click', toggleDatePicker);
  if (isDatePickerVisible) {
    document.getElementById('date-picker-popover').addEventListener('click', handleDatePickerClick);
    document.getElementById('year-input').addEventListener('input', handleYearInputChange);
  }
  
  document.getElementById('new-btn').addEventListener('click', handleNew);
  document.getElementById('save-btn').addEventListener('click', handleSaveFile);
  document.getElementById('import-btn').addEventListener('click', handleImport);

  const idInput = document.getElementById('calendar-id');
  idInput.value = currentId;
  idInput.addEventListener('input', e => {
    currentId = e.target.value;
    // The currentId is now just for saving, so we don't need to re-render or switch data
  });

  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.addEventListener('click', handleCalendarClick);
  calendarGrid.addEventListener('mousedown', handleDragStart);
  
  const calendarBoard = document.getElementById('calendar-board');
  calendarBoard.addEventListener('wheel', handleCalendarWheel);

  popover.addEventListener('click', handlePopoverAction);
  
  document.removeEventListener('click', handleDocumentClick);
  document.addEventListener('click', handleDocumentClick);

  const decoBar = document.querySelector('.decoration-bar');
  decoBar.addEventListener('input', handleDecorationChange);
  decoBar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', handleDecorationChange);
  });
  
  updateDecorationBar();

  // Render template popover if needed
  renderTemplatePopover();
};

// --- 初期化 ---
const initialize = () => {
    loadDataFromLocalStorage();
    render();
};

initialize();
