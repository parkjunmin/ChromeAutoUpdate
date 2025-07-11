// 전역 변수들
let port = null;
let isConnected = false;
let checkInProgress = false;
let progressInterval = null;
let countdownInterval = null;
let currentTheme = 'light';

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', function() {
  console.log('[ChromeAutoUpdate] DOM 로드 완료');
  
  // UI 요소들 가져오기
  const elements = {
    statusDiv: document.getElementById('status'),
    startBtn: document.getElementById('start'),
    stopBtn: document.getElementById('stop'),
    checkNowBtn: document.getElementById('checkNow'),
    checkNowText: document.getElementById('checkNowText'),
    intervalInput: document.getElementById('interval'),
    connectionStatus: document.getElementById('connectionStatus'),
    chromeInfo: document.getElementById('chromeInfo'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    countdown: document.getElementById('countdown'),
    statsInfo: document.getElementById('statsInfo'),
    themeToggle: document.getElementById('themeToggle'),
    container: document.getElementById('container'),
    exportSettings: document.getElementById('exportSettings'),
    importSettings: document.getElementById('importSettings'),
    resetSettings: document.getElementById('resetSettings'),
    openLogs: document.getElementById('openLogs'),
    importFile: document.getElementById('importFile')
  };

  // 요소 존재 확인
  const missingElements = Object.keys(elements).filter(key => !elements[key]);
  if (missingElements.length > 0) {
    console.error('[ChromeAutoUpdate] 누락된 UI 요소들:', missingElements);
    return;
  }

  // 초기화 함수들 실행
  initializeApp();
  setupIntervalInput();
  // 저장된 interval 불러오기
  chrome.storage.local.get(['updateInterval'], result => {
    if (result.updateInterval) {
      document.getElementById('interval').value = result.updateInterval;
    }
  });
});

// 앱 초기화
async function initializeApp() {
  try {
    // 테마 로드
    await loadTheme();
    
    // 크롬 버전 정보 표시
    loadChromeInfo();
    
    // 통계 정보 로드
    loadStats();
    
    // 백그라운드와 연결
    connectToBackground();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 저장된 설정 불러오기
    loadSavedSettings();
    
    // 주기적으로 연결 상태 확인
    setInterval(checkConnection, 5000);
    
    // 접근성 개선
    setupAccessibility();
    
    console.log('[ChromeAutoUpdate] 초기화 완료');
  } catch (error) {
    console.error('[ChromeAutoUpdate] 초기화 실패:', error);
    showStatus('초기화 실패: ' + error.message, 'error');
  }
}

// 테마 관리
async function loadTheme() {
  try {
    const result = await chrome.storage.local.get(['theme']);
    currentTheme = result.theme || 'light';
    applyTheme(currentTheme);
  } catch (error) {
    console.error('[ChromeAutoUpdate] 테마 로드 실패:', error);
  }
}

function applyTheme(theme) {
  const container = document.getElementById('container');
  const themeToggle = document.getElementById('themeToggle');
  
  if (theme === 'dark') {
    container.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
    themeToggle.title = '라이트 모드 전환 (Alt+T)';
  } else {
    container.removeAttribute('data-theme');
    themeToggle.textContent = '🌙';
    themeToggle.title = '다크 모드 전환 (Alt+T)';
  }
  
  currentTheme = theme;
}

async function toggleTheme() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  
  try {
    await chrome.storage.local.set({ theme: newTheme });
    showStatus(`${newTheme === 'dark' ? '다크' : '라이트'} 모드로 전환됨`, 'success');
  } catch (error) {
    console.error('[ChromeAutoUpdate] 테마 저장 실패:', error);
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 테마 토글 버튼
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // 프리셋 버튼
  setupPresetButtons();
  
  // 메인 버튼
  setupMainButtons();
  
  // 설정 관련 버튼
  setupSettingsButtons();
  
  // 키보드 단축키
  setupKeyboardShortcuts();
}

// 키보드 단축키 설정
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(event) {
    // Alt 키 조합
    if (event.altKey) {
      switch (event.key) {
        case 't':
        case 'T':
          event.preventDefault();
          toggleTheme();
          break;
        case '1':
          event.preventDefault();
          setPresetInterval(30);
          break;
        case '2':
          event.preventDefault();
          setPresetInterval(60);
          break;
        case '3':
          event.preventDefault();
          setPresetInterval(300);
          break;
        case '4':
          event.preventDefault();
          setPresetInterval(1800);
          break;
      }
      return;
    }
    
    // 기본 키
    switch (event.key) {
      case 'Enter':
        if (event.target.tagName !== 'INPUT') {
          event.preventDefault();
          document.getElementById('start').click();
        }
        break;
      case 'Escape':
        event.preventDefault();
        document.getElementById('stop').click();
        break;
      case ' ':
        if (event.target.tagName !== 'INPUT') {
          event.preventDefault();
          document.getElementById('checkNow').click();
        }
        break;
      case 'F1':
        event.preventDefault();
        showHelp();
        break;
    }
  });
  
  // 입력 필드에서 Enter 키 처리
  document.getElementById('interval').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('start').click();
    }
  });
}

// 설정 관련 버튼
function setupSettingsButtons() {
  // 설정 내보내기
  document.getElementById('exportSettings').addEventListener('click', exportSettings);
  
  // 설정 가져오기
  document.getElementById('importSettings').addEventListener('click', function() {
    document.getElementById('importFile').click();
  });
  
  // 파일 선택 처리
  document.getElementById('importFile').addEventListener('change', importSettings);
  
  // 설정 초기화
  document.getElementById('resetSettings').addEventListener('click', resetSettings);
  
  // 로그 보기
  document.getElementById('openLogs').addEventListener('click', openLogs);
}

// 설정 내보내기
async function exportSettings() {
  try {
    const settings = await chrome.storage.local.get();
    const exportData = {
      ...settings,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `chrome-auto-update-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showStatus('설정이 내보내기 됨', 'success');
  } catch (error) {
    console.error('[ChromeAutoUpdate] 설정 내보내기 실패:', error);
    showStatus('내보내기 실패: ' + error.message, 'error');
  }
}

// 설정 가져오기
async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    // 유효성 검사
    if (!importData.version) {
      throw new Error('유효하지 않은 설정 파일입니다');
    }
    
    // 중요 설정만 가져오기
    const settingsToImport = {
      updateInterval: importData.updateInterval,
      autoUpdateEnabled: importData.autoUpdateEnabled,
      theme: importData.theme
    };
    
    await chrome.storage.local.set(settingsToImport);
    
    // UI 업데이트
    if (importData.updateInterval) {
      document.getElementById('interval').value = importData.updateInterval;
    }
    
    if (importData.theme) {
      applyTheme(importData.theme);
    }
    
    showStatus('설정이 가져오기 됨', 'success');
    loadStats(); // 통계 새로고침
  } catch (error) {
    console.error('[ChromeAutoUpdate] 설정 가져오기 실패:', error);
    showStatus('가져오기 실패: ' + error.message, 'error');
  }
  
  // 파일 입력 초기화
  event.target.value = '';
}

// 설정 초기화
async function resetSettings() {
  if (!confirm('모든 설정을 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    return;
  }
  
  try {
    await chrome.storage.local.clear();
    
    // UI 초기화
    document.getElementById('interval').value = 60;
    applyTheme('light');
    
    showStatus('설정이 초기화됨', 'success');
    loadStats(); // 통계 새로고침
  } catch (error) {
    console.error('[ChromeAutoUpdate] 설정 초기화 실패:', error);
    showStatus('초기화 실패: ' + error.message, 'error');
  }
}

// 로그 보기
function openLogs() {
  // 새 창으로 확장 프로그램 관리 페이지 열기
  chrome.tabs.create({
    url: 'chrome://extensions/?id=' + chrome.runtime.id
  }, () => {
    showStatus('확장 프로그램 페이지에서 백그라운드 페이지를 검사하여 로그를 확인하세요', 'info');
  });
}

// 도움말 표시
function showHelp() {
  const helpText = `
키보드 단축키:
• Enter: 자동 업데이트 시작
• Escape: 자동 업데이트 중지  
• Space: 즉시 업데이트 확인
• Alt+T: 다크 모드 전환
• Alt+1~4: 프리셋 시간 설정
• F1: 이 도움말 표시

기능:
• 설정 내보내기/가져오기
• 다크 모드 지원
• 접근성 개선
• 실시간 연결 상태 표시
  `;
  
  alert(helpText);
}

// 프리셋 간격 설정
function setPresetInterval(seconds) {
  const intervalInput = document.getElementById('interval');
  intervalInput.value = seconds;
  showStatus(`${seconds}초로 설정됨`, 'success');
  
  // 시각적 피드백
  intervalInput.style.borderColor = 'var(--success)';
  setTimeout(() => {
    intervalInput.style.borderColor = '';
  }, 1000);
}

// 접근성 설정
function setupAccessibility() {
  // 스크린 리더 지원
  const statusDiv = document.getElementById('status');
  statusDiv.setAttribute('role', 'status');
  statusDiv.setAttribute('aria-live', 'polite');
  
  // 버튼에 적절한 라벨 추가
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    if (!button.getAttribute('aria-label') && button.title) {
      button.setAttribute('aria-label', button.title);
    }
  });
  
  // 연결 상태 표시를 접근 가능하게 만들기
  const connectionStatus = document.getElementById('connectionStatus');
  connectionStatus.setAttribute('role', 'img');
  connectionStatus.setAttribute('aria-label', '연결 상태');
}

// 크롬 버전 정보 로드
async function loadChromeInfo() {
  const chromeInfo = document.getElementById('chromeInfo');
  try {
    let version = 'Unknown';
    let channel = 'Stable';
    let os = 'Unknown';
    let architecture = '';
    const userAgent = navigator.userAgent;

    // 0. 가장 정확한 방법: chrome.runtime.getBrowserInfo (MV3 지원)
    if (chrome.runtime.getBrowserInfo) {
      try {
        const info = await chrome.runtime.getBrowserInfo();
        if (info && info.version) {
          version = info.version; // 예: 138.0.7204.50
        }
      } catch (err) {
        console.warn('[ChromeAutoUpdate] getBrowserInfo 실패:', err);
      }
    }

    // 1. userAgent에서 4단계 버전 우선 추출 (getBrowserInfo가 Unknown일 때만)
    if (version === 'Unknown') {
      const uaMatch = userAgent.match(/Chrome\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
      if (uaMatch && uaMatch[1]) {
        version = uaMatch[1];
      }
    }

    // 2. userAgentData 고해상도(High-Entropy) 값 시도 (버전이 아직 Unknown이면)
    if (version === 'Unknown' && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        const highEntropy = await navigator.userAgentData.getHighEntropyValues(['fullVersionList']);
        if (highEntropy.fullVersionList && highEntropy.fullVersionList.length) {
          const chromeBrand = highEntropy.fullVersionList.find(b => b.brand === 'Google Chrome' || b.brand === 'Chromium');
          if (chromeBrand && chromeBrand.version) {
            version = chromeBrand.version; // 예: 138.0.7204.50
          }
        }
        if (navigator.userAgentData.platform) {
          os = navigator.userAgentData.platform;
        }
      } catch (e) {
        console.warn('[ChromeAutoUpdate] userAgentData high entropy 값 가져오기 실패:', e);
      }
    }

    // 3. 여전히 Unknown이면 UAData brands 사용 (major 버전만 가능)
    if (version === 'Unknown' && navigator.userAgentData && navigator.userAgentData.brands) {
      const brand = navigator.userAgentData.brands.find(b => b.brand === 'Google Chrome' || b.brand === 'Chromium');
      if (brand && brand.version) {
        version = brand.version; // 예: 138
      }
      if (navigator.userAgentData.platform) {
        os = navigator.userAgentData.platform;
      }
    }

    // 채널 정보 추정
    if (userAgent.includes('Edg/')) {
      channel = 'Edge';
    } else if (userAgent.includes('OPR/')) {
      channel = 'Opera';
    } else if (userAgent.toLowerCase().includes('beta')) {
      channel = 'Beta';
    } else if (userAgent.toLowerCase().includes('dev')) {
      channel = 'Dev';
    } else if (userAgent.toLowerCase().includes('canary')) {
      channel = 'Canary';
    }

    // OS/아키텍처 정보
    const platform = navigator.platform;
    if (platform.includes('Win')) {
      os = 'Windows';
      if (userAgent.includes('WOW64') || userAgent.includes('Win64') || userAgent.includes('x64')) {
        architecture = ' (64비트)';
      } else {
        architecture = ' (32비트)';
      }
    } else if (platform.includes('Mac')) {
      os = 'macOS';
      if (userAgent.includes('Intel')) {
        architecture = ' (Intel)';
      } else if (userAgent.includes('Apple Silicon') || userAgent.includes('ARM')) {
        architecture = ' (Apple Silicon)';
      }
    } else if (platform.includes('Linux')) {
      os = 'Linux';
      if (userAgent.includes('x86_64')) {
        architecture = ' (64비트)';
      }
    }

    // 빌드 정보
    const buildInfo = channel === 'Stable' ? '(공식 빌드)' : `(${channel} 빌드)`;

    // robust multi-line display
    chromeInfo.innerHTML = `
      <div style="word-break:break-all;line-height:1.5;">
        🌐 Chrome <span id="chromeVersionText">${version}</span><br>
        💻 ${os}${architecture} • ${buildInfo}<br>
        📅 ${new Date().toLocaleDateString('ko-KR')}
      </div>
    `;

    // 최신 버전 정보도 곧 추가 예정
    await fetchAndCompareLatestChromeVersion(version, os, channel);

    // 버전 마스킹(0.0.0.0, 138.0.0.0 등) 시 대체 UX 제공
    const chromeVersionText = document.getElementById('chromeVersionText');
    if (chromeVersionText) {
      // 마스킹 여부 판별: 0.0.0.0 또는 x.0.0.0 등
      const masked = /^\d+\.0\.0\.0$/.test(version) || version === '0.0.0.0' || version === 'Unknown';
      if (masked) {
        chromeVersionText.innerHTML += ' <span style="color:#e53e3e;">(정확한 버전 확인 불가)</span>';
        // 백그라운드에서 정확한 버전 정보 요청
        console.log('[ChromeAutoUpdate] 버전 정보 마스킹 감지, 백그라운드에서 정확한 버전 요청');
        try {
          if (port && port.postMessage) {
            port.postMessage({ action: 'getBrowserInfo' });
          }
        } catch (error) {
          console.error('[ChromeAutoUpdate] 백그라운드 버전 요청 실패:', error);
        }
        // 카드 안내 및 버튼 완전 제거 (아무것도 추가하지 않음)
        showStatus('Chrome 버전이 마스킹되어 정확한 최신 여부를 자동 확인할 수 없습니다. chrome://settings/help에서 직접 확인하세요.', 'warning');
      }
    }

    console.log('[ChromeAutoUpdate] 크롬 정보 로드됨:', {
      version,
      channel,
      os,
      architecture,
      userAgent: userAgent.substring(0, 100) + '...'
    });
  } catch (error) {
    chromeInfo.textContent = '크롬 버전 정보를 가져올 수 없습니다';
    console.error('[ChromeAutoUpdate] 크롬 버전 정보 로드 실패:', error);
  }
}

// 최신 크롬 버전 정보 가져오기 및 비교
async function fetchAndCompareLatestChromeVersion(currentVersion, os, channel) {
  try {
    // Chromium Dash API 사용 (PRIMARY) - 더 안정적이고 깔끔한 JSON 형태
    // https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1
    let platform = 'Windows';
    if (os.toLowerCase().includes('mac')) platform = 'Mac';
    if (os.toLowerCase().includes('linux')) platform = 'Linux';
    let apiUrl = `https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=${platform}&num=1`;

    console.log('[ChromeAutoUpdate] 최신 버전 정보 요청 시작 (PRIMARY):', apiUrl);
    console.log('[ChromeAutoUpdate] 현재 버전:', currentVersion, 'OS:', os, 'Platform:', platform);
    
    // 타임아웃 설정 (15초로 연장)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[ChromeAutoUpdate] 요청 타임아웃 (15초)');
      controller.abort();
    }, 15000);
    
    const startTime = Date.now();
    
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Chrome Extension ChromeAutoUpdate/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    console.log('[ChromeAutoUpdate] API 응답 시간:', responseTime + 'ms');
    console.log('[ChromeAutoUpdate] 응답 상태:', res.status, res.statusText);
    console.log('[ChromeAutoUpdate] 응답 헤더:', Object.fromEntries(res.headers.entries()));
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('[ChromeAutoUpdate] API 오류 응답:', errorText);
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
    }
    
    const responseText = await res.text();
    console.log('[ChromeAutoUpdate] Raw 응답:', responseText.substring(0, 500) + '...');
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[ChromeAutoUpdate] JSON 파싱 오류:', parseError);
      throw new Error(`JSON 파싱 실패: ${parseError.message}`);
    }
    
    console.log('[ChromeAutoUpdate] 파싱된 데이터:', data);
    
    // 응답 데이터 검증 (Chromium Dash API 형태)
    if (!data) {
      throw new Error('응답 데이터가 null입니다');
    }
    
    if (!Array.isArray(data)) {
      console.warn('[ChromeAutoUpdate] 응답이 배열이 아닙니다:', typeof data);
      throw new Error('응답이 배열 형태가 아닙니다');
    }
    
    if (data.length === 0) {
      console.warn('[ChromeAutoUpdate] 응답 배열이 비어있습니다');
      throw new Error('응답 배열이 비어있습니다');
    }
    
    const latestVersionInfo = data[0];
    console.log('[ChromeAutoUpdate] 최신 버전 정보:', latestVersionInfo);
    
    const latest = latestVersionInfo?.version;
    
    if (!latest || typeof latest !== 'string') {
      console.error('[ChromeAutoUpdate] 버전 정보 오류:', latest);
      throw new Error('버전 정보가 응답에 포함되지 않았습니다');
    }
    
    console.log('[ChromeAutoUpdate] 최신 버전:', latest, '현재 버전:', currentVersion);
    
    // 버전 비교 결과 표시
    displayVersionComparison(currentVersion, latest);
    
    console.log('[ChromeAutoUpdate] 버전 비교 완료');
    
  } catch (error) {
    console.error('[ChromeAutoUpdate] 최신 버전 정보 확인 실패:', error);
    console.error('[ChromeAutoUpdate] 오류 스택:', error.stack);
    
    // 일시적으로 에러 메시지 저장 (백업 방법이 모두 실패하면 표시)
    let errorMessage = '(오류)';
    
    if (error.name === 'AbortError') {
      errorMessage = '(연결 시간 초과)';
      console.error('[ChromeAutoUpdate] 연결 시간 초과 - 네트워크 상태를 확인하세요');
    } else if (error.message.includes('HTTP')) {
      errorMessage = '(서버 오류)';
      console.error('[ChromeAutoUpdate] 서버 오류 - API 서버에 문제가 있을 수 있습니다');
    } else if (error.message.includes('JSON')) {
      errorMessage = '(응답 형식 오류)';
      console.error('[ChromeAutoUpdate] JSON 파싱 오류 - API 응답 형식이 변경되었을 수 있습니다');
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = '(네트워크 오류)';
      console.error('[ChromeAutoUpdate] 네트워크 오류 - 인터넷 연결을 확인하세요');
    } else {
      errorMessage = '(알 수 없는 오류)';
      console.error('[ChromeAutoUpdate] 알 수 없는 오류:', error.message);
    }
    
    // 백업 방법 시도 (Google Version History API)
    try {
      console.log('[ChromeAutoUpdate] 백업 방법 시도 (Google Version History API)');
      
      // Google Version History API 사용 (BACKUP)
      let backupPlatform = 'win';
      if (os.toLowerCase().includes('mac')) backupPlatform = 'mac';
      if (os.toLowerCase().includes('linux')) backupPlatform = 'linux';
      const backupApiUrl = `https://versionhistory.googleapis.com/v1/chrome/platforms/${backupPlatform}/channels/stable/versions?limit=1`;
      
      console.log(`[ChromeAutoUpdate] 백업 API 시도: ${backupApiUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[ChromeAutoUpdate] 백업 API 타임아웃');
        controller.abort();
      }, 10000);
      
      const res = await fetch(backupApiUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Chrome Extension ChromeAutoUpdate/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        console.log(`[ChromeAutoUpdate] 백업 API 응답:`, data);
        
        if (data && data.versions && data.versions.length > 0 && data.versions[0].version) {
          const version = data.versions[0].version;
          console.log(`[ChromeAutoUpdate] 백업 API로 버전 획득: ${version}`);
          
          // 이전 에러 메시지 제거하고 새로운 버전 비교 결과 표시
          clearVersionStatus();
          displayVersionComparison(currentVersion, version);
          return; // 성공적으로 버전 정보를 가져왔으므로 종료
        }
      }
      
      // 마지막 수단: 최신 알려진 안정 버전 사용
      console.log('[ChromeAutoUpdate] 모든 API 실패 - 최신 알려진 버전 사용');
      const knownStableVersion = '138.0.7204.98'; // 정기적으로 업데이트 가능
      
      console.log(`[ChromeAutoUpdate] 알려진 안정 버전 사용: ${knownStableVersion}`);
      
      // 이전 에러 메시지 제거하고 새로운 버전 비교 결과 표시
      clearVersionStatus();
      displayVersionComparison(currentVersion, knownStableVersion);
      
    } catch (backupError) {
      console.error('[ChromeAutoUpdate] 백업 방법도 실패:', backupError);
      
      // 모든 방법이 실패했으므로 에러 메시지 표시
      const chromeVersionText = document.getElementById('chromeVersionText');
      if (chromeVersionText) {
        chromeVersionText.innerHTML += ` <span style="color:#e53e3e;">${errorMessage}</span>`;
      }
    }
  }
}

// 버전 상태 표시 지우기
function clearVersionStatus() {
  const chromeVersionText = document.getElementById('chromeVersionText');
  if (chromeVersionText) {
    // 버전 상태 관련 스팬 태그들을 제거
    const statusSpans = chromeVersionText.querySelectorAll('span[style*="color"]');
    statusSpans.forEach(span => span.remove());
  }
}

// 버전 비교 결과 표시
function displayVersionComparison(currentVersion, latestVersion) {
  const chromeVersionText = document.getElementById('chromeVersionText');
  if (!chromeVersionText) {
    console.warn('[ChromeAutoUpdate] chromeVersionText 요소를 찾을 수 없습니다');
    return;
  }

  // 현재 버전이 Unknown인 경우 비교 불가 처리
  if (currentVersion === 'Unknown' || currentVersion === '' || !currentVersion) {
    console.warn('[ChromeAutoUpdate] 현재 버전이 Unknown이므로 비교 불가');
    chromeVersionText.innerHTML += ' <span style="color:#e53e3e;">(버전 확인 불가)</span>';
    return;
  }

  // 버전 비교 (메이저 버전 비교)
  const currentMajor = currentVersion.split('.')[0];
  const latestMajor = latestVersion.split('.')[0];
  
  console.log('[ChromeAutoUpdate] 버전 비교:', `현재 메이저: ${currentMajor}, 최신 메이저: ${latestMajor}`);
  
  // 숫자 변환 검증
  const currentMajorNum = parseInt(currentMajor);
  const latestMajorNum = parseInt(latestMajor);
  
  if (isNaN(currentMajorNum) || isNaN(latestMajorNum)) {
    console.warn('[ChromeAutoUpdate] 버전 숫자 변환 실패:', { currentMajor, latestMajor });
    chromeVersionText.innerHTML += ' <span style="color:#e53e3e;">(버전 형식 오류)</span>';
    return;
  }
  
  if (currentMajorNum >= latestMajorNum) {
    chromeVersionText.innerHTML += ' <span style="color:#38a169;">(최신)</span>';
    console.log('[ChromeAutoUpdate] 최신 버전 사용 중');
  } else {
    chromeVersionText.innerHTML += ` <span style="color:#e53e3e;">(최신 아님: ${latestVersion})</span>`;
    console.log('[ChromeAutoUpdate] 업데이트 필요:', latestVersion);
    // 최신이 아니면 업데이트 안내 버튼 표시
    showUpdateGuideButton(latestVersion);
  }
}

// 업데이트 안내 버튼 표시
function showUpdateGuideButton(latestVersion) {
  let updateBtn = document.getElementById('chromeUpdateGuideBtn');
  if (!updateBtn) {
    updateBtn = document.createElement('button');
    updateBtn.id = 'chromeUpdateGuideBtn';
    updateBtn.className = 'update-guide-btn';
    updateBtn.innerHTML = `🔄 Chrome 업데이트 안내`;
    updateBtn.style.margin = '8px 0 0 0';
    updateBtn.style.padding = '6px 12px';
    updateBtn.style.background = '#e53e3e';
    updateBtn.style.color = '#fff';
    updateBtn.style.border = '2px solid #b91c1c';
    updateBtn.style.borderRadius = '6px';
    updateBtn.style.fontSize = '13px';
    updateBtn.style.fontWeight = 'bold';
    updateBtn.style.cursor = 'pointer';
    updateBtn.style.boxShadow = '0 2px 8px rgba(229,62,62,0.15)';
    updateBtn.style.width = '100%';
    updateBtn.style.textAlign = 'center';
    updateBtn.style.wordWrap = 'break-word';
    updateBtn.style.lineHeight = '1.2';
    updateBtn.onclick = function() {
      try {
        if (chrome.tabs) {
          chrome.tabs.create({ url: 'chrome://settings/help' });
        } else {
          window.open('chrome://settings/help', '_blank');
        }
      } catch (err) {
        window.open('https://support.google.com/chrome/answer/95414', '_blank');
      }
    };
    const chromeInfo = document.getElementById('chromeInfo');
    chromeInfo.appendChild(updateBtn);
  }
  updateBtn.style.display = 'block';
  updateBtn.innerHTML = `🔄 업데이트 안내<br><span style="font-size:11px;">(최신: ${latestVersion})</span>`;
}

// 통계 정보 로드
async function loadStats() {
  try {
    const stats = await chrome.storage.local.get([
      'checkCount', 'lastCheckTime', 'lastCheckResult', 'installDate'
    ]);
    
    const statsInfo = document.getElementById('statsInfo');
    
    if (stats.checkCount) {
      const lastCheck = stats.lastCheckTime ? 
        new Date(stats.lastCheckTime).toLocaleString('ko-KR') : '없음';
      const result = stats.lastCheckResult || '알 수 없음';
      const installDays = stats.installDate ? 
        Math.floor((Date.now() - stats.installDate) / (1000 * 60 * 60 * 24)) : 0;
      
      statsInfo.innerHTML = `
        총 ${stats.checkCount}회 확인 • 설치 후 ${installDays}일<br>
        마지막: ${lastCheck} • 결과: ${result}
      `;
    } else {
      statsInfo.innerHTML = '아직 업데이트 확인 내역이 없습니다';
    }
  } catch (error) {
    console.error('[ChromeAutoUpdate] 통계 로드 실패:', error);
  }
}

// 백그라운드 연결
function connectToBackground() {
  try {
    if (port) {
      port.disconnect();
    }
    
    port = chrome.runtime.connect({ name: "popup" });
    console.log('[ChromeAutoUpdate] 백그라운드 연결 시도');
    
    port.onMessage.addListener(msg => {
      if (msg.type === 'browserVersion') {
        showExactVersion(msg.version);
      }
      if (msg.type === 'latestVersion') {
        compareVersion(msg.latest);
        // 백업 방법으로 받은 버전 정보임을 표시
        if (msg.response && msg.response.includes('조회 성공')) {
          console.log('[ChromeAutoUpdate] 백그라운드를 통해 최신 버전 정보 획득:', msg.latest);
        }
      }
      // 기존 메시지 핸들러 유지
      handleBackgroundMessage(msg);
    });
    
    port.onDisconnect.addListener(() => {
      console.log('[ChromeAutoUpdate] 포트 연결 해제됨');
      isConnected = false;
      updateConnectionStatus();
      
      if (chrome.runtime.lastError) {
        console.error('[ChromeAutoUpdate] 연결 에러:', chrome.runtime.lastError.message);
        showStatus('백그라운드 연결 실패', 'error');
      }
      
      // 3초 후 재연결 시도
      setTimeout(() => {
        if (!isConnected) {
          console.log('[ChromeAutoUpdate] 재연결 시도');
          connectToBackground();
        }
      }, 3000);
    });
    
    // 연결 성공 시 상태 업데이트
    setTimeout(() => {
      if (port && !chrome.runtime.lastError) {
        isConnected = true;
        updateConnectionStatus();
        showStatus('백그라운드와 연결됨', 'success');
      }
    }, 100);
    
  } catch (error) {
    console.error('[ChromeAutoUpdate] 연결 실패:', error);
    showStatus('연결 실패: ' + error.message, 'error');
    isConnected = false;
    updateConnectionStatus();
  }
}

function showExactVersion(version) {
  const chromeInfo = document.getElementById('chromeInfo');
  if (!chromeInfo) return;
  // 기존 innerHTML에서 버전 부분만 교체
  chromeInfo.innerHTML = `
    <div style="word-break:break-all;line-height:1.5;">
      🌐 Chrome <span id="chromeVersionText">${version}</span><br>
      💻 Windows (64비트) • (공식 빌드)<br>
      📅 ${new Date().toLocaleDateString('ko-KR')}
    </div>
  `;
}

function compareVersion(latest) {
  const chromeVersionText = document.getElementById('chromeVersionText');
  if (!chromeVersionText) return;
  
  // 현재 버전 텍스트에서 버전 번호만 추출 (기존 상태 메시지 제거)
  const currentVersionMatch = chromeVersionText.textContent.match(/(\d+\.\d+\.\d+\.\d+|Unknown)/);
  const currentVersion = currentVersionMatch ? currentVersionMatch[0] : 'Unknown';
  
  // 기존 상태 메시지 제거 후 새로운 비교 결과 표시
  clearVersionStatus();
  displayVersionComparison(currentVersion, latest);
}

// 연결 상태 확인
function checkConnection() {
  if (!isConnected && port) {
    try {
      port.postMessage({ action: "ping" });
    } catch (error) {
      console.log('[ChromeAutoUpdate] 연결 끊어짐, 재연결 시도');
      connectToBackground();
    }
  }
}

// 연결 상태 UI 업데이트
function updateConnectionStatus() {
  const statusElement = document.getElementById('connectionStatus');
  if (isConnected) {
    statusElement.classList.add('connected');
    statusElement.setAttribute('aria-label', '백그라운드와 연결됨');
    statusElement.title = '백그라운드와 연결됨';
  } else {
    statusElement.classList.remove('connected');
    statusElement.setAttribute('aria-label', '백그라운드 연결 끊어짐');
    statusElement.title = '백그라운드 연결 끊어짐';
  }
}

// 백그라운드 메시지 처리
function handleBackgroundMessage(msg) {
  console.log('[ChromeAutoUpdate] 백그라운드 메시지:', msg);
  
  // 최신 업데이트 알림(명확하게 표시)
  if (msg.type === 'updateAvailable') {
    showStatus('🚨 Chrome 최신 업데이트가 있습니다! 업데이트 안내 버튼을 확인하세요.', 'update-warning');
    showUpdateGuideButton(msg.latestVersion || '최신버전');
    return;
  }
  
  // 알람 상태 업데이트
  if (msg.alarmStatus) {
    updateAlarmStatusDisplay(msg.alarmStatus);
  }
  
  // 자동 실행 상태 표시
  if (msg.isAutoRunning) {
    showBackgroundStatus(msg.response);
  }
  
  if (msg.error) {
    showStatus(msg.error, 'error');
    stopProgress();
    return;
  }
  
  if (msg.response) {
    showStatus(msg.response, msg.type || 'info');
  }
  
  if (msg.status === 'checking') {
    startProgress();
  } else {
    stopProgress();
  }
  
  // 통계 정보 업데이트
  if (msg.stats) {
    updateStatsDisplay(msg.stats);
  }
}

// 알람 상태 표시 업데이트
function updateAlarmStatusDisplay(alarmStatus) {
  const statusDiv = document.getElementById('status');
  
  if (alarmStatus.active) {
    // 백그라운드 자동 확인 활성 상태 표시
    const alarmInfo = document.createElement('div');
    alarmInfo.className = 'alarm-status active';
    alarmInfo.innerHTML = `
      <div class="alarm-indicator">
        🔄 <strong>백그라운드 자동 확인 중</strong>
      </div>
      <div class="alarm-details">
        📅 주기: ${alarmStatus.interval}초 | ⏰ 다음: ${alarmStatus.nextTime}
      </div>
    `;
    
    // 기존 알람 상태 제거 후 새로 추가
    const existingAlarmStatus = document.querySelector('.alarm-status');
    if (existingAlarmStatus) {
      existingAlarmStatus.remove();
    }
    
    statusDiv.appendChild(alarmInfo);
    
    console.log('[ChromeAutoUpdate] 알람 상태 표시 업데이트:', alarmStatus);
  } else {
    // 비활성 상태 - 기존 표시 제거
    const existingAlarmStatus = document.querySelector('.alarm-status');
    if (existingAlarmStatus) {
      existingAlarmStatus.remove();
    }
  }
}

// 백그라운드 상태 표시
function showBackgroundStatus(message) {
  const statusDiv = document.getElementById('status');
  
  const backgroundInfo = document.createElement('div');
  backgroundInfo.className = 'background-status';
  backgroundInfo.innerHTML = `
    <div class="background-indicator">
      ✅ ${message}
    </div>
    <div class="background-note">
      💡 팝업을 닫아도 백그라운드에서 계속 확인됩니다
    </div>
  `;
  
  // 기존 백그라운드 상태 제거 후 새로 추가
  const existingBackgroundStatus = document.querySelector('.background-status');
  if (existingBackgroundStatus) {
    existingBackgroundStatus.remove();
  }
  
  statusDiv.appendChild(backgroundInfo);
  
  // 3초 후 자동 제거
  setTimeout(() => {
    if (backgroundInfo.parentNode) {
      backgroundInfo.remove();
    }
  }, 5000);
}

// 프리셋 버튼 설정
function setupPresetButtons() {
  const presetButtons = document.querySelectorAll('.preset-btn');
  
  presetButtons.forEach(button => {
    button.addEventListener('click', function() {
      const seconds = parseInt(this.getAttribute('data-seconds'));
      setPresetInterval(seconds);
    });
  });
}

// 메인 버튼 설정
function setupMainButtons() {
  const elements = {
    startBtn: document.getElementById('start'),
    stopBtn: document.getElementById('stop'),
    checkNowBtn: document.getElementById('checkNow'),
    intervalInput: document.getElementById('interval')
  };

  // 시작 버튼
  elements.startBtn.addEventListener('click', function() {
    const sec = Number(elements.intervalInput.value);
    console.log(`[ChromeAutoUpdate] 시작 버튼 클릭: ${sec}초`);
    
    if (!sec || sec < 60) {
      showStatus('최소 60초(1분) 이상으로 설정해주세요', 'warning');
      elements.intervalInput.focus();
      return;
    }
    
    if (sec > 3600) {
      showStatus('최대 3600초(1시간)까지 설정 가능합니다', 'warning');
      elements.intervalInput.focus();
      return;
    }
    
    if (!isConnected) {
      showStatus('백그라운드 연결을 확인해주세요', 'error');
      connectToBackground();
      return;
    }
    
    showStatus('자동 업데이트 설정 중...', 'info');
    this.disabled = true;
    
    try {
      sendMessage({ action: "start", interval: sec }, () => {
        this.disabled = false;
      });
    } catch (error) {
      console.error('[ChromeAutoUpdate] 시작 메시지 전송 실패:', error);
      showStatus('설정 실패: ' + error.message, 'error');
      this.disabled = false;
    }
  });

  // 중지 버튼
  elements.stopBtn.addEventListener('click', function() {
    console.log('[ChromeAutoUpdate] 중지 버튼 클릭');
    
    if (!isConnected) {
      showStatus('백그라운드 연결을 확인해주세요', 'error');
      return;
    }
    
    showStatus('자동 업데이트 중지 중...', 'info');
    this.disabled = true;
    
    try {
      sendMessage({ action: "stop" }, () => {
        this.disabled = false;
      });
    } catch (error) {
      console.error('[ChromeAutoUpdate] 중지 메시지 전송 실패:', error);
      showStatus('중지 실패: ' + error.message, 'error');
      this.disabled = false;
    }
  });

  // 지금 확인 버튼
  elements.checkNowBtn.addEventListener('click', function() {
    console.log('[ChromeAutoUpdate] 지금 확인 버튼 클릭');
    
    if (checkInProgress) {
      showStatus('이미 확인 중입니다', 'warning');
      return;
    }
    
    if (!isConnected) {
      showStatus('백그라운드 연결을 확인해주세요', 'error');
      connectToBackground();
      return;
    }
    
    startProgress();
    
    try {
      sendMessage({ action: "checkNow" }, () => {
        // 콜백에서 처리
      });
    } catch (error) {
      console.error('[ChromeAutoUpdate] 확인 메시지 전송 실패:', error);
      showStatus('확인 실패: ' + error.message, 'error');
      stopProgress();
    }
  });
}

// 메시지 전송 (재시도 로직 포함)
function sendMessage(message, callback) {
  if (!port || !isConnected) {
    throw new Error('백그라운드와 연결되지 않았습니다');
  }
  
  try {
    port.postMessage(message);
    console.log(`[ChromeAutoUpdate] 메시지 전송: ${JSON.stringify(message)}`);
    if (callback) callback();
  } catch (error) {
    console.error('[ChromeAutoUpdate] 메시지 전송 에러:', error);
    
    // 연결이 끊어진 경우 재연결 시도
    if (error.message.includes('disconnected')) {
      isConnected = false;
      connectToBackground();
      
      // 1초 후 재시도
      setTimeout(() => {
        if (isConnected) {
          try {
            port.postMessage(message);
            if (callback) callback();
          } catch (retryError) {
            throw retryError;
          }
        } else {
          throw new Error('재연결 실패');
        }
      }, 1000);
    } else {
      throw error;
    }
  }
}

// 진행 상황 시작
function startProgress() {
  checkInProgress = true;
  const checkNowBtn = document.getElementById('checkNow');
  const checkNowText = document.getElementById('checkNowText');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const countdown = document.getElementById('countdown');
  
  // 버튼 비활성화 및 스피너 표시
  checkNowBtn.disabled = true;
  checkNowText.innerHTML = '<span class="spinner"></span>확인 중...';
  
  // 진행 바 표시
  progressBar.style.display = 'block';
  countdown.style.display = 'block';
  
  let progress = 0;
  let timeLeft = 10; // 10초 가정
  
  progressInterval = setInterval(() => {
    progress += 2;
    if (progress > 100) progress = 100;
    
    progressFill.style.width = progress + '%';
    progressFill.setAttribute('aria-valuenow', progress);
    
    if (progress >= 100) {
      clearInterval(progressInterval);
    }
  }, 200);
  
  countdownInterval = setInterval(() => {
    timeLeft--;
    countdown.textContent = `${timeLeft}초 후 완료 예정`;
    countdown.setAttribute('aria-label', `${timeLeft}초 후 완료 예정`);
    
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      countdown.textContent = '완료 중...';
      countdown.setAttribute('aria-label', '완료 중');
    }
  }, 1000);
}

// 진행 상황 중지
function stopProgress() {
  checkInProgress = false;
  const checkNowBtn = document.getElementById('checkNow');
  const checkNowText = document.getElementById('checkNowText');
  const progressBar = document.getElementById('progressBar');
  const countdown = document.getElementById('countdown');
  
  // 버튼 활성화
  checkNowBtn.disabled = false;
  checkNowText.textContent = '🔍 지금 확인';
  
  // 진행 바 숨기기
  setTimeout(() => {
    progressBar.style.display = 'none';
    countdown.style.display = 'none';
  }, 1000);
  
  // 인터벌 정리
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// 저장된 설정 불러오기
async function loadSavedSettings() {
  try {
    const result = await chrome.storage.local.get(['updateInterval', 'theme', 'autoUpdateEnabled']);
    
    if (result.updateInterval) {
      const intervalInput = document.getElementById('interval');
      intervalInput.value = result.updateInterval;
      console.log(`[ChromeAutoUpdate] 저장된 주기 불러옴: ${result.updateInterval}초`);
    }
    
    if (result.theme) {
      currentTheme = result.theme;
      applyTheme(currentTheme);
    }
    
    // 자동 업데이트가 활성화된 경우 알람 상태 확인
    if (result.autoUpdateEnabled) {
      console.log('[ChromeAutoUpdate] 자동 업데이트가 활성화됨 - 알람 상태 확인');
      
      // 1초 후 알람 상태 확인 (연결 완료 후)
      setTimeout(() => {
        if (isConnected) {
          sendMessage({ action: "getAlarmStatus" }, () => {
            console.log('[ChromeAutoUpdate] 시작 시 알람 상태 확인 완료');
          });
        }
      }, 1000);
    }
    
  } catch (error) {
    console.error('[ChromeAutoUpdate] 설정 불러오기 실패:', error);
  }
}

// 상태 메시지 표시
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  if (!statusDiv) return;
  
  const colors = {
    success: '#d4edda',
    error: '#f8d7da',
    info: '#d1ecf1',
    warning: '#fff3cd',
    'update-warning': '#ffe5e5'
  };
  
  const borderColors = {
    success: '#c3e6cb',
    error: '#f5c6cb',
    info: '#bee5eb',
    warning: '#ffeaa7',
    'update-warning': '#e53e3e'
  };
  
  // 다크모드 색상 보정
  const isDark = document.getElementById('container').getAttribute('data-theme') === 'dark';
  if (isDark) {
    if (type === 'update-warning') {
      statusDiv.style.backgroundColor = '#4b1e1e';
      statusDiv.style.color = '#fff';
      statusDiv.style.borderLeftColor = '#ff5555';
      statusDiv.style.fontWeight = 'bold';
    } else if (type === 'error') {
      statusDiv.style.backgroundColor = '#4b1e1e';
      statusDiv.style.color = '#fff';
      statusDiv.style.borderLeftColor = '#ff5555';
      statusDiv.style.fontWeight = 'bold';
    } else if (type === 'success') {
      statusDiv.style.backgroundColor = '#1e4620';
      statusDiv.style.color = '#d4edda';
      statusDiv.style.borderLeftColor = '#38a169';
      statusDiv.style.fontWeight = 'bold';
    } else if (type === 'warning') {
      statusDiv.style.backgroundColor = '#4b3e1e';
      statusDiv.style.color = '#fff3cd';
      statusDiv.style.borderLeftColor = '#ffeaa7';
      statusDiv.style.fontWeight = 'bold';
    } else {
      statusDiv.style.backgroundColor = '#222e3c';
      statusDiv.style.color = '#bee5eb';
      statusDiv.style.borderLeftColor = '#3182ce';
      statusDiv.style.fontWeight = 'normal';
    }
  } else {
    statusDiv.style.backgroundColor = colors[type] || colors.info;
    statusDiv.style.borderLeftColor = borderColors[type] || borderColors.info;
    statusDiv.style.color = '#333';
    statusDiv.style.fontWeight = (type === 'update-warning' || type === 'error' || type === 'success' || type === 'warning') ? 'bold' : 'normal';
  }
  statusDiv.textContent = message;
  // 접근성을 위한 aria-label 업데이트
  statusDiv.setAttribute('aria-label', `상태: ${message}`);
  
  console.log(`[ChromeAutoUpdate] 상태: ${message}`);
  
  // 5초 후 기본 상태로 복원 (에러/업데이트 경고가 아닌 경우)
  if (type !== 'error' && type !== 'update-warning') {
    setTimeout(() => {
      if (statusDiv.textContent === message) {
        statusDiv.style.backgroundColor = 'var(--bg-secondary)';
        statusDiv.style.borderLeftColor = 'var(--primary)';
        statusDiv.style.color = '';
        statusDiv.style.fontWeight = 'normal';
        statusDiv.textContent = '대기 중...';
        statusDiv.setAttribute('aria-label', '상태: 대기 중');
      }
    }, 5000);
  }
}

// 초기 상태 설정
setTimeout(() => {
  showStatus('초기화 완료', 'success');
}, 1000);

// interval 값 변경 시 저장
function setupIntervalInput() {
  const intervalInput = document.getElementById('interval');
  if (!intervalInput) return;
  intervalInput.addEventListener('change', function() {
    const val = Number(intervalInput.value);
    if (val >= 10 && val <= 3600) {
      chrome.storage.local.set({ updateInterval: val });
    }
  });
}


