const defaultLists = {
  "_Animals": [ "Dog", "Cat", "Bird" ],
  "_Rainbow": [ "Red", "Orange", "Yellow", "Green", "Blue", "Indigo", "Violet" ]
};
const MISSED_VAULT_KEY = "⚠️ Missed Words Vault";
let spellingLists = defaultLists;
let enabledVoiceNames = null;
let sessionHistory = [];
let missedWordsVault = [];
let activeMashSession = null;
let availableVoices = [];
let currentQueue = [];
let nextQueue = [];
let currentWordIndex = 0;
let roundNumber = 1;
let initialTotal = 0;
let currentTestModeName = '';
let sessionStartTime = null;
let firstTimeCorrectCount = 0;
let totalMistakesCount = 0;
let recognition = null;

function sanitizeKey(key) {
  if (!key) return "Untitled List";
  return key.trim().replace(/[.#$\[\]\/]/g, '-');
}

function validateAndSanitizeTitle(rawTitle) {
  const sanitized = sanitizeKey(rawTitle);
  const hasForbiddenChars = /[.#$\[\]\/]/.test(rawTitle);
  if (hasForbiddenChars) {
    const confirmUse = confirm(
      `The title "${rawTitle}" contains characters that aren't allowed in the database (. # $ / [ ]).\n\n` +
      `Suggested safe title: "${sanitized}"\n\n` +
      `Click OK to use "${sanitized}", or Cancel to rename it manually.`
    );
    return confirmUse ? sanitized : null;
  }
  return sanitized;
}

function getMostRecentFridayKey(keys) {
  const datedKeys = keys.filter(k => /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(k));
  if (datedKeys.length === 0) return keys[0] || null;
  datedKeys.sort((a, b) => {
    const dateA = extractDateFromString(a);
    const dateB = extractDateFromString(b);
    return dateB - dateA;
  });
  return datedKeys[0];
}

function extractDateFromString(str) {
  const match = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!match) return new Date(0);
  let month = parseInt(match[1], 10) - 1;
  let day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}

spellingRef.on("value", (snapshot) => {
  const serverData = snapshot.val();
  if (serverData) {
    if (serverData.spellingLists) spellingLists = serverData.spellingLists;
    if (serverData.enabledVoiceNames) enabledVoiceNames = serverData.enabledVoiceNames;
    if (serverData.sessionHistory) sessionHistory = serverData.sessionHistory;
    if (serverData.missedWordsVault) missedWordsVault = serverData.missedWordsVault;
    if (serverData.activeMashSession) activeMashSession = serverData.activeMashSession;
    localStorage.setItem('spellingLists', JSON.stringify(spellingLists));
    if (enabledVoiceNames) localStorage.setItem('enabledVoiceNames', JSON.stringify(enabledVoiceNames));
    localStorage.setItem('spellingSessionHistory', JSON.stringify(sessionHistory));
    localStorage.setItem('spellingMissedWordsVault', JSON.stringify(missedWordsVault));
    if (activeMashSession) localStorage.setItem('spellingActiveMashSession', JSON.stringify(activeMashSession));
    loadVoices();
    populateAllDropdowns();
    checkResumeBanner();
    if (document.getElementById('view-manager') && document.getElementById('view-manager').classList.contains('active')) {
      renderListManager();
    }
  } else {
    saveData();
  }
});

function saveData() {
  const safeLists = {};
  Object.keys(spellingLists).forEach(k => {
    safeLists[sanitizeKey(k)] = spellingLists[k];
  });
  spellingLists = safeLists;
  localStorage.setItem('spellingLists', JSON.stringify(spellingLists));
  if (enabledVoiceNames) localStorage.setItem('enabledVoiceNames', JSON.stringify(enabledVoiceNames));
  localStorage.setItem('spellingSessionHistory', JSON.stringify(sessionHistory));
  localStorage.setItem('spellingMissedWordsVault', JSON.stringify(missedWordsVault));
  if (activeMashSession) localStorage.setItem('spellingActiveMashSession', JSON.stringify(activeMashSession));
  spellingRef.set({
    spellingLists: spellingLists,
    enabledVoiceNames: enabledVoiceNames,
    sessionHistory: sessionHistory,
    missedWordsVault: missedWordsVault,
    activeMashSession: activeMashSession
  }).catch(err => console.error("Firebase sync error:", err));
}

function switchView(viewId) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) target.classList.add('active');
  if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
  if (viewId === 'view-home' || viewId === 'view-quiz') {
    loadVoices();
    populateAllDropdowns();
  }
  if (viewId === 'view-manager') renderListManager();
}

function checkResumeBanner() {
  const banner = document.getElementById('resume-banner');
  const details = document.getElementById('resume-details');
  if (!banner || !details) return;
  if (activeMashSession && activeMashSession.batches && activeMashSession.currentBatchIndex < activeMashSession.batches.length) {
    banner.style.display = 'block';
    details.innerText = `${activeMashSession.title} - Batch ${activeMashSession.currentBatchIndex + 1} of ${activeMashSession.batches.length}`;
  } else {
    banner.style.display = 'none';
  }
}

function loadVoices() {
  if (typeof window.speechSynthesis === 'undefined') return;
  let allLoadedVoices = window.speechSynthesis.getVoices();
  availableVoices = allLoadedVoices.filter(v => !v.name.toLowerCase().includes('ralph'));
  const savedVoiceName = localStorage.getItem('selectedVoiceName');
  const voiceSelects = [document.getElementById('voice-selector'), document.getElementById('voice-selector-quiz')];
  voiceSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = '';
    if (availableVoices.length === 0) {
      const option = document.createElement('option');
      option.textContent = "Loading voices...";
      select.appendChild(option);
      return;
    }
    if (!enabledVoiceNames) {
      enabledVoiceNames = availableVoices.filter(v => v.lang.startsWith('en')).map(v => v.name);
      if (enabledVoiceNames.length === 0) enabledVoiceNames = availableVoices.map(v => v.name);
    }
    const filteredVoices = availableVoices.filter(v => enabledVoiceNames.includes(v.name));
    const voicesToDisplay = filteredVoices.length > 0 ? filteredVoices : availableVoices;
    voicesToDisplay.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      select.appendChild(option);
    });
    if (savedVoiceName && voicesToDisplay.some(v => v.name === savedVoiceName)) {
      select.value = savedVoiceName;
    } else if (voicesToDisplay.length > 0) {
      select.value = voicesToDisplay[0].name;
    }
  });
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = loadVoices;
}

function syncAndPreviewVoice(val) {
  if (!val || val === "Loading voices...") return;
  localStorage.setItem('selectedVoiceName', val);
  const s1 = document.getElementById('voice-selector');
  const s2 = document.getElementById('voice-selector-quiz');
  if (s1) s1.value = val;
  if (s2) s2.value = val;
  speakWithCustomVoice("Shannon's Spelling Bee Hub", 1.0, null, val);
}

function syncLists(val) {
  if (!val) return;
  const s1 = document.getElementById('list-selector-home');
  const s2 = document.getElementById('list-selector-quiz');
  if (s1) s1.value = val;
  if (s2) s2.value = val;
}

function getSelectedVoice() {
  const voiceSelect = document.getElementById('voice-selector') || document.getElementById('voice-selector-quiz');
  const selectedName = voiceSelect ? voiceSelect.value : null;
  if (selectedName && selectedName !== "Loading voices...") {
    localStorage.setItem('selectedVoiceName', selectedName);
    return availableVoices.find(v => v.name === selectedName) || availableVoices[0] || null;
  }
  return availableVoices[0] || null;
}

function speakWithCustomVoice(text, rate = 1.0, callback = null, specificVoiceName = null) {
  if (typeof window.speechSynthesis === 'undefined') return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  let chosenVoice = specificVoiceName ? availableVoices.find(v => v.name === specificVoiceName) : getSelectedVoice();
  if (chosenVoice) utterance.voice = chosenVoice;
  if (callback) utterance.onend = callback;
  window.speechSynthesis.speak(utterance);
}

function openVoiceModal() {
  const modalList = document.getElementById('modal-voice-list');
  if (!modalList) return;
  modalList.innerHTML = '';
  if (availableVoices.length === 0) {
    modalList.innerHTML = '<div style="padding: 10px; text-align:center;">No voices found yet. Try reloading.</div>';
  }
  availableVoices.forEach(voice => {
    const isChecked = !enabledVoiceNames || enabledVoiceNames.includes(voice.name);
    const div = document.createElement('div');
    div.className = 'voice-item';
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${voice.name}" ${isChecked ? 'checked' : ''}>
        ${voice.name} (${voice.lang})
      </label>
      <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="previewSpecificVoice('${voice.name.replace(/'/g, "\\'")}')">🔊 Preview</button>
    `;
    modalList.appendChild(div);
  });
  const modal = document.getElementById('voice-modal');
  if (modal) modal.style.display = 'flex';
}

function closeVoiceModal() {
  const modal = document.getElementById('voice-modal');
  if (modal) modal.style.display = 'none';
  if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
}

function previewSpecificVoice(voiceName) {
  speakWithCustomVoice("Shannon's Spelling Bee Hub", 1.0, null, voiceName);
}

function saveVoicePreferences() {
  const checkboxes = document.querySelectorAll('#modal-voice-list input[type="checkbox"]');
  let selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
  if (selected.length === 0) {
    alert("Please select at least one voice!");
    return;
  }
  enabledVoiceNames = selected;
  saveData();
  closeVoiceModal();
  loadVoices();
  populateAllDropdowns();
}

function openWordMashModal() {
  const modalList = document.getElementById('modal-word-mash-list');
  if (!modalList) return;
  modalList.innerHTML = '';
  const keys = Object.keys(spellingLists);
  if (keys.length === 0 && missedWordsVault.length === 0) {
    alert("No spelling lists available!");
    return;
  }
  keys.forEach(key => {
    const div = document.createElement('div');
    div.className = 'voice-item';
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${key}" checked>
        <strong>${key}</strong> (${spellingLists[key].length} words)
      </label>
    `;
    modalList.appendChild(div);
  });
  const modal = document.getElementById('word-mash-modal');
  if (modal) modal.style.display = 'flex';
}

function closeWordMashModal() {
  const modal = document.getElementById('word-mash-modal');
  if (modal) modal.style.display = 'none';
}

function toggleAllWordMashLists(selectState) {
  const checkboxes = document.querySelectorAll('#modal-word-mash-list input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = selectState);
}

function startCustomWordMash() {
  const checkboxes = document.querySelectorAll('#modal-word-mash-list input[type="checkbox"]');
  let selectedLists = [];
  checkboxes.forEach(cb => { if (cb.checked) selectedLists.push(cb.value); });
  if (selectedLists.length === 0) {
    alert("Please select at least one list for the Word-Mash!");
    return;
  }
  let combinedWords = [];
  selectedLists.forEach(key => {
    if (spellingLists[key]) combinedWords = combinedWords.concat(spellingLists[key]);
  });
  combinedWords = [...new Set(combinedWords)];
  combinedWords.sort(() => Math.random() - 0.5);
  const batchSizeInput = document.getElementById('mash-batch-size');
  const batchSize = batchSizeInput ? parseInt(batchSizeInput.value, 10) : 15;
  let batches = [];
  for (let i = 0; i < combinedWords.length; i += batchSize) {
    batches.push(combinedWords.slice(i, i + batchSize));
  }
  activeMashSession = {
    title: `Word-Mash (${combinedWords.length} words)`,
    batches: batches,
    currentBatchIndex: 0
  };
  saveData();
  closeWordMashModal();
  startCurrentMashBatch();
}

function startCurrentMashBatch() {
  if (!activeMashSession || !activeMashSession.batches) return;
  const index = activeMashSession.currentBatchIndex;
  const totalBatches = activeMashSession.batches.length;
  const batchWords = activeMashSession.batches[index];
  currentTestModeName = `${activeMashSession.title} [Batch ${index + 1}/${totalBatches}]`;
  startQuizSession(batchWords, `🌪️ ${activeMashSession.title} (Batch ${index + 1}/${totalBatches})`);
}

function proceedToNextBatch() {
  if (activeMashSession) {
    activeMashSession.currentBatchIndex++;
    saveData();
    startCurrentMashBatch();
  }
}

function resumeWordMashBatch() {
  if (activeMashSession) startCurrentMashBatch();
}

function clearActiveMashSession() {
  activeMashSession = null;
  saveData();
  checkResumeBanner();
}

function openHistoryModal() {
  const container = document.getElementById('modal-history-list');
  if (!container) return;
  container.innerHTML = '';
  if (sessionHistory.length === 0) {
    container.innerHTML = '<div style="padding: 15px; text-align:center; color: #7F8C8D;">No practice history recorded yet. Complete a quiz to see stats here!</div>';
  } else {
    sessionHistory.forEach(record => {
      const div = document.createElement('div');
      div.className = 'history-card';
      const pct = record.total > 0 ? Math.round((record.firstTry / record.total) * 100) : 0;
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong>${record.mode}</strong>
          <span style="color: #7F8C8D; font-size: 11px;">${record.date}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #555;">
          <span>First Try: <strong style="color: var(--success);">${record.firstTry}/${record.total} (${pct}%)</strong></span>
          <span>Mistakes: <strong style="color: var(--danger);">${record.mistakes}</strong></span>
          <span>Time: <strong>${formatTime(record.duration)}</strong></span>
        </div>
      `;
      container.appendChild(div);
    });
  }
  const modal = document.getElementById('history-modal');
  if (modal) modal.style.display = 'flex';
}

function closeHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) modal.style.display = 'none';
}

function clearHistory() {
  if (confirm("Are you sure you want to clear your practice history?")) {
    sessionHistory = [];
    saveData();
    openHistoryModal();
  }
}

function exportHistoryOnly() {
  if (sessionHistory.length === 0) {
    alert("No history recorded yet to export.");
    return;
  }
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ sessionHistory: sessionHistory }, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "spelling_practice_history.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function exportData() {
  const backup = {
    spellingLists: spellingLists,
    enabledVoiceNames: enabledVoiceNames,
    sessionHistory: sessionHistory,
    missedWordsVault: missedWordsVault
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "spelling_bee_hub.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(event) {
  const fileInput = event.target;
  if (!fileInput.files || !fileInput.files[0]) return;
  const file = fileInput.files[0];
  const fileReader = new FileReader();
  fileReader.onload = (e) => {
    try {
      const rawText = e.target.result;
      let imported;
      try {
        imported = JSON.parse(rawText);
      } catch (parseErr) {
        alert(`JSON Syntax Error: The file is not valid JSON.\nDetails: ${parseErr.message}`);
        fileInput.value = '';
        return;
      }
      const rawListsData = imported.spellingLists || (typeof imported === 'object' && !imported.sessionHistory ? imported : null);
      if (!rawListsData || typeof rawListsData !== 'object' || Object.keys(rawListsData).length === 0) {
        alert("Import Error: The JSON file does not contain valid spelling lists ('spellingLists').");
        fileInput.value = '';
        return;
      }
      const cleanListsData = {};
      Object.keys(rawListsData).forEach(k => {
        cleanListsData[sanitizeKey(k)] = rawListsData[k];
      });
      spellingLists = cleanListsData;
      if (imported.enabledVoiceNames && Array.isArray(imported.enabledVoiceNames)) {
        enabledVoiceNames = imported.enabledVoiceNames;
      }
      if (imported.sessionHistory && Array.isArray(imported.sessionHistory)) {
        sessionHistory = imported.sessionHistory;
      }
      if (imported.missedWordsVault && Array.isArray(imported.missedWordsVault)) {
        missedWordsVault = imported.missedWordsVault;
      }
      saveData();
      loadVoices();
      populateAllDropdowns();
      if (document.getElementById('view-manager')) renderListManager();
      alert(`Successfully imported ${Object.keys(spellingLists).length} spelling lists into Firebase and synced across devices!`);
      fileInput.value = '';
    } catch (err) {
      alert(`Unexpected error during import: ${err.message}`);
      fileInput.value = '';
    }
  };
  fileReader.onerror = () => {
    alert("Error reading the file from disk.");
    fileInput.value = '';
  };
  fileReader.readAsText(file, "UTF-8");
}

function populateAllDropdowns() {
  const selects = [document.getElementById('list-selector-home'), document.getElementById('list-selector-quiz')];
  const keys = Object.keys(spellingLists);
  const mostRecentKey = getMostRecentFridayKey(keys);
  selects.forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    if (missedWordsVault.length > 0) {
      const vaultOption = document.createElement('option');
      vaultOption.value = MISSED_VAULT_KEY;
      vaultOption.textContent = `${MISSED_VAULT_KEY} (${missedWordsVault.length} words)`;
      select.appendChild(vaultOption);
    }
    keys.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${key} (${spellingLists[key].length} words)`;
      select.appendChild(option);
    });
    if (currentVal && (keys.includes(currentVal) || currentVal === MISSED_VAULT_KEY)) {
      select.value = currentVal;
    } else if (mostRecentKey) {
      select.value = mostRecentKey;
      syncLists(mostRecentKey);
    }
  });
}

function startQuizFromSelectedList() {
  const homeSelect = document.getElementById('list-selector-home');
  const selectedKey = homeSelect ? homeSelect.value : null;
  if (selectedKey === MISSED_VAULT_KEY) {
    if (missedWordsVault.length === 0) {
      alert("Missed Words Vault is currently empty! Great job!");
      return;
    }
    currentTestModeName = MISSED_VAULT_KEY;
    let listWords = [...missedWordsVault];
    listWords.sort(() => Math.random() - 0.5);
    startQuizSession(listWords, `⚠️ Missed Words Vault (${listWords.length} words)`);
    return;
  }
  if (!selectedKey || !spellingLists[selectedKey]) {
    alert("Please select a valid spelling list!");
    return;
  }
  currentTestModeName = selectedKey;
  let listWords = [...spellingLists[selectedKey]];
  listWords.sort(() => Math.random() - 0.5);
  startQuizSession(listWords, `✏️ Quiz: ${selectedKey}`);
}

function startQuizSession(wordArray, titleText) {
  currentQueue = wordArray;
  nextQueue = [];
  currentWordIndex = 0;
  roundNumber = 1;
  initialTotal = currentQueue.length;
  firstTimeCorrectCount = 0;
  totalMistakesCount = 0;
  sessionStartTime = Date.now();
  const quizTitleEl = document.getElementById('quiz-title');
  if (quizTitleEl) quizTitleEl.innerText = titleText;
  switchView('view-quiz');
  updateUI();
  setTimeout(() => { playWord(); }, 800);
}

function playWord() {
  if (currentQueue.length === 0) return;
  const word = currentQueue[currentWordIndex];
  speakWithCustomVoice(word, 0.85);
}

function startVoiceSpelling() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition is not supported by this browser. Try using Google Chrome or Safari!");
    return;
  }
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript.trim().toLowerCase();
      const cleanedWord = speechResult.replace(/[\s-]/g, '').replace(/[^a-z]/g, '');
      const input = document.getElementById('answer-input');
      if (input) {
        input.value = cleanedWord;
        checkSpelling();
      }
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) micBtn.style.background = '#9B59B6';
    };
    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) micBtn.style.background = '#9B59B6';
    };
    recognition.onend = () => {
      const micBtn = document.getElementById('mic-btn');
      if (micBtn) micBtn.style.background = '#9B59B6';
    };
  }
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) micBtn.style.background = '#E74C3C';
  try {
    recognition.start();
  } catch (e) {
    console.error("Recognition already started", e);
  }
}

function checkSpelling(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('answer-input');
  if (!input) return;
  const userGuess = input.value.trim().toLowerCase().replace(/[^a-z]/g, '');
  const targetWord = currentQueue[currentWordIndex].toLowerCase();
  if (!userGuess) return;
  if (userGuess === targetWord) {
    if (roundNumber === 1) {
      firstTimeCorrectCount++;
      if (currentTestModeName === MISSED_VAULT_KEY) {
        missedWordsVault = missedWordsVault.filter(w => w.toLowerCase() !== targetWord);
        saveData();
      }
    }
    const feedback = document.getElementById('feedback-message');
    if (feedback) {
      feedback.className = "feedback correct";
      feedback.innerText = "✨ Correct!";
    }
    speakWithCustomVoice("Correct!", 1.0);
    input.value = '';
    currentWordIndex++;
    setTimeout(() => {
      if (feedback) feedback.innerText = '';
      checkQueueProgress();
    }, 1000);
  } else {
    totalMistakesCount++;
    nextQueue.push(targetWord);
    if (!missedWordsVault.some(w => w.toLowerCase() === targetWord)) {
      missedWordsVault.push(targetWord);
      saveData();
    }
    input.value = '';
    showCorrectionScreen(targetWord);
  }
}

function showCorrectionScreen(word) {
  switchView('view-correction');
  const targetDisplay = document.getElementById('target-word-display');
  const spelledText = document.getElementById('spelled-out-text');
  if (targetDisplay) targetDisplay.innerText = word;
  if (spelledText) {
    const spacedSpellingDisplay = word.split('').join(' - ');
    spelledText.innerText = `Spelled: ${spacedSpellingDisplay}`;
  }
  if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
  setTimeout(() => {
    speakWithCustomVoice("Incorrect. The word is", 0.75, () => {
      setTimeout(() => {
        speakWithCustomVoice(word, 0.65, () => {
          setTimeout(() => {
            const spelledSpoken = word.split('').join(' . ');
            speakWithCustomVoice(`It is spelled: ${spelledSpoken}`, 0.6);
          }, 400);
        });
      }, 300);
    });
  }, 100);
}

function proceedAfterCorrection() {
  if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
  switchView('view-quiz');
  currentWordIndex++;
  checkQueueProgress();
}

function checkQueueProgress() {
  if (currentWordIndex >= currentQueue.length) {
    if (nextQueue.length === 0) {
      showCompletionScreen();
      return;
    } else {
      currentQueue = [...nextQueue];
      nextQueue = [];
      currentWordIndex = 0;
      roundNumber++;
    }
  }
  updateUI();
  playWord();
  const ansInput = document.getElementById('answer-input');
  if (ansInput) ansInput.focus();
}

function updateUI() {
  const roundEl = document.getElementById('round-indicator');
  const totalWordsEl = document.getElementById('stat-total-words');
  const wordsLeftEl = document.getElementById('words-left');
  const firstCorrectEl = document.getElementById('stat-first-correct');
  const totalMistakesEl = document.getElementById('stat-total-mistakes');
  const progressBar = document.getElementById('progress-bar');
  if (roundEl) roundEl.innerText = `Round ${roundNumber}`;
  if (totalWordsEl) totalWordsEl.innerText = initialTotal;
  if (wordsLeftEl) wordsLeftEl.innerText = currentQueue.length - currentWordIndex;
  if (firstCorrectEl) firstCorrectEl.innerText = firstTimeCorrectCount;
  if (totalMistakesEl) totalMistakesEl.innerText = totalMistakesCount;
  if (progressBar && initialTotal > 0) {
    const progress = ((initialTotal - (currentQueue.length - currentWordIndex + nextQueue.length)) / initialTotal) * 100;
    progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }
}

function showCompletionScreen() {
  switchView('view-completion');
  const sessionDurationSeconds = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
  const formattedDuration = formatTime(sessionDurationSeconds);
  const historyRecord = {
    date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    mode: currentTestModeName,
    total: initialTotal,
    firstTry: firstTimeCorrectCount,
    mistakes: totalMistakesCount,
    duration: sessionDurationSeconds
  };
  sessionHistory.unshift(historyRecord);
  if (sessionHistory.length > 50) sessionHistory.pop();
  saveData();
  const pct = initialTotal > 0 ? Math.round((firstTimeCorrectCount / initialTotal) * 100) : 0;
  let motivationalPhrase = "";
  let spokenPhrase = "";
  if (pct === 100) {
    motivationalPhrase = "🌟 Flawless Victory! You mastered every single word on the first try!";
    spokenPhrase = "Flawless victory! You mastered every single word on the first try!";
  } else if (pct >= 80) {
    motivationalPhrase = "🎉 Outstanding job! You crushed this spelling list!";
    spokenPhrase = "Outstanding job! You crushed this spelling list!";
  } else if (pct >= 50) {
    motivationalPhrase = "👍 Good solid effort! Keep practicing to lock in those tricky words.";
    spokenPhrase = "Good solid effort! Keep practicing to lock in those tricky words.";
  } else {
    motivationalPhrase = "💪 Keep at it! Every mistake is just helping your brain learn.";
    spokenPhrase = "Keep at it! Every practice makes you stronger.";
  }
  const summaryText = document.getElementById('completion-summary');
  if (summaryText) {
    summaryText.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; color: var(--primary); margin-bottom: 15px;">${motivationalPhrase}</div>
      <div class="stats-card-box">
        <div>🎯 First-Try Accuracy: <strong>${firstTimeCorrectCount} / ${initialTotal} (${pct}%)</strong></div>
        <div>❌ Total Mistakes: <strong>${totalMistakesCount}</strong></div>
        <div>⏱️ Total Time: <strong>${formattedDuration}</strong></div>
      </div>
    `;
  }
  const nextBatchBtn = document.getElementById('btn-next-batch');
  if (nextBatchBtn) {
    if (activeMashSession && activeMashSession.batches && (activeMashSession.currentBatchIndex + 1) < activeMashSession.batches.length) {
      nextBatchBtn.style.display = 'block';
      nextBatchBtn.innerText = `Proceed to Batch ${activeMashSession.currentBatchIndex + 2} of ${activeMashSession.batches.length} ➡️`;
    } else {
      nextBatchBtn.style.display = 'none';
      if (activeMashSession) {
        activeMashSession = null;
        saveData();
      }
    }
  }
  speakWithCustomVoice(spokenPhrase, 1.0);
}

function renderListManager() {
  const container = document.getElementById('manager-lists-container');
  if (!container) return;
  container.innerHTML = '';
  const keys = Object.keys(spellingLists);
  if (keys.length === 0) {
    container.innerHTML = '<div style="color: #7F8C8D; margin: 20px 0;">No lists available. Add one below!</div>';
    return;
  }
  keys.forEach(key => {
    const div = document.createElement('div');
    div.style.cssText = 'background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 10px; text-align: left;';
    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="font-size: 16px; color: var(--primary);">${key}</strong>
        <div>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;" onclick="editList('${key.replace(/'/g, "\\'")}')">✏️ Edit</button>
          <button class="btn btn-danger" onclick="deleteList('${key.replace(/'/g, "\\'")}')">🗑️ Delete</button>
        </div>
      </div>
      <div style="font-size: 13px; color: #555; word-wrap: break-word;">
        ${spellingLists[key].join(', ')}
      </div>
    `;
    container.appendChild(div);
  });
}

function addNewList() {
  const nameInput = document.getElementById('new-list-name');
  const wordsInput = document.getElementById('new-list-words');
  if (!nameInput || !wordsInput) return;
  const rawName = nameInput.value.trim();
  const wordsRaw = wordsInput.value.trim();
  if (!rawName || !wordsRaw) {
    alert("Please enter a list name and words!");
    return;
  }
  const safeName = validateAndSanitizeTitle(rawName);
  if (!safeName) return;
  const words = wordsRaw.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
  const uniqueWords = [...new Set(words)];
  spellingLists[safeName] = uniqueWords;
  saveData();
  nameInput.value = '';
  wordsInput.value = '';
  renderListManager();
  populateAllDropdowns();
  alert(`List "${safeName}" added with ${uniqueWords.length} words!`);
}

function editList(key) {
  const rawNewName = prompt("Edit list name:", key);
  if (rawNewName === null) return;
  const safeName = validateAndSanitizeTitle(rawNewName);
  if (!safeName) return;
  const currentWords = spellingLists[key] ? spellingLists[key].join(', ') : '';
  const newWordsRaw = prompt("Edit words (separated by commas or lines):", currentWords);
  if (newWordsRaw === null) return;
  const words = newWordsRaw.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
  const uniqueWords = [...new Set(words)];
  if (safeName !== key) {
    delete spellingLists[key];
  }
  spellingLists[safeName] = uniqueWords;
  saveData();
  renderListManager();
  populateAllDropdowns();
}

function deleteList(key) {
  if (confirm(`Are you sure you want to delete the list "${key}"?`)) {
    delete spellingLists[key];
    saveData();
    renderListManager();
    populateAllDropdowns();
  }
}

window.onload = () => {
  switchView('view-home');
};