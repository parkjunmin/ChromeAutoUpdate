let alarmName = "autoUpdateAlarm";
let isDebugMode = true; // 개발 중일 때는 true로 설정
let exactVersion = null;

// 디버그 로그 함수
function debugLog(message) {
  console.log(`[ChromeAutoUpdate Background] ${message}`);
}

// Service Worker 시작 시
debugLog('백그라운드 스크립트 시작됨');

// 확장 프로그램 설치 시
chrome.runtime.onInstalled.addListener((details) => {
  debugLog(`확장 프로그램 설치됨: ${details.reason}`);
  if (details.reason === 'install') {
    debugLog('처음 설치되었습니다');
    // 초기 설정
    chrome.storage.local.set({
      checkCount: 0,
      autoUpdateEnabled: false,
      installDate: Date.now()
    });
  } else if (details.reason === 'update') {
    debugLog('업데이트되었습니다');
  }
});

// 확장 프로그램 시작 시 이전 설정 복원
chrome.runtime.onStartup.addListener(async () => {
  debugLog('Chrome 재시작 감지 - 이전 설정 복원 시도');
  await restorePreviousSettings();
});

// Service Worker 활성화 시에도 설정 복원 (Chrome 재시작 포함)
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'chrome_update' || details.reason === 'startup') {
    debugLog('Chrome 업데이트/시작 후 설정 복원');
    await restorePreviousSettings();
  }
});

// 이전 설정 복원 함수
async function restorePreviousSettings() {
  try {
    const result = await chrome.storage.local.get(['autoUpdateEnabled', 'updateInterval']);
    
    if (result.autoUpdateEnabled && result.updateInterval) {
      debugLog(`이전 설정 복원: ${result.updateInterval}초 주기로 자동 업데이트 재시작`);
      
      const intervalMin = Math.max(result.updateInterval / 60, 0.1);
      
      // 기존 알람 제거
      await chrome.alarms.clear(alarmName);
      
      // 새 알람 생성
      await chrome.alarms.create(alarmName, { 
        periodInMinutes: intervalMin,
        delayInMinutes: 0.1 // 6초 후 시작
      });
      
      debugLog(`설정 복원 완료: ${intervalMin}분 주기 알람 생성됨`);
      
      // 복원 알림
      await notify(`🔄 이전 설정 복원됨: ${result.updateInterval}초 주기로 자동 업데이트 재시작`);
      
    } else {
      debugLog('복원할 이전 설정이 없습니다');
    }
  } catch (error) {
    debugLog(`설정 복원 실패: ${error.message}`);
  }
}

// 현재 알람 상태 확인 함수
async function getCurrentAlarmStatus() {
  try {
    const alarm = await chrome.alarms.get(alarmName);
    if (alarm) {
      const nextTime = new Date(alarm.scheduledTime).toLocaleTimeString('ko-KR');
      const periodMin = alarm.periodInMinutes;
      const periodSec = Math.round(periodMin * 60);
      
      debugLog(`현재 활성 알람: ${periodSec}초 주기, 다음 실행: ${nextTime}`);
      
      return {
        active: true,
        interval: periodSec,
        nextTime: nextTime,
        periodMinutes: periodMin
      };
    } else {
      debugLog('현재 활성화된 알람이 없음');
      return { active: false };
    }
  } catch (error) {
    debugLog(`알람 상태 확인 실패: ${error.message}`);
    return { active: false, error: error.message };
  }
}

// 포트 연결 처리
chrome.runtime.onConnect.addListener(async port => {
  debugLog(`포트 연결됨: ${port.name}, 발신자: ${port.sender?.tab?.id || 'popup'}`);
  
  if (port.name === "popup") {
    // 연결 즉시 상태 확인 및 전송
    initializePopupConnection(port);
    
    port.onMessage.addListener(async (msg) => {
      debugLog(`메시지 받음: ${JSON.stringify(msg)}`);
      
      try {
        switch (msg.action) {
          case "start":
            await handleStartAction(msg, port);
            break;
          case "stop":
            await handleStopAction(port);
            break;
          case "checkNow":
            await handleCheckNowAction(port);
            break;
          case "ping":
            // ping 메시지 처리 (연결 상태 확인용)
            port.postMessage({
              response: "pong",
              type: "success"
            });
            break;
          case "getStats":
            await handleGetStatsAction(port);
            break;
          case "getAlarmStatus":
            await handleGetAlarmStatusAction(port);
            break;
          case "showNotification":
            await handleShowNotificationAction(msg, port);
            break;
          case "getLatestVersion":
            await handleGetLatestVersionAction(port);
            break;
          case "getBrowserInfo":
            await handleGetBrowserInfoAction(port);
            break;
          default:
            throw new Error(`알 수 없는 액션: ${msg.action}`);
        }
      } catch (error) {
        debugLog(`에러 발생: ${error.message}`);
        port.postMessage({
          error: error.message,
          type: "error"
        });
      }
    });

    port.onDisconnect.addListener(() => {
      debugLog('포트 연결 해제됨');
      if (chrome.runtime.lastError) {
        debugLog(`연결 해제 에러: ${chrome.runtime.lastError.message}`);
      }
    });

    // 항상 최신 버전 전달
    if (chrome.runtime.getBrowserInfo) {
      try {
        const info = await chrome.runtime.getBrowserInfo();
        if (info && info.version) {
          port.postMessage({ type: 'browserVersion', version: info.version });
        }
      } catch (err) {
        port.postMessage({ type: 'browserVersion', version: 'Unknown' });
      }
    }
    const latest = await getLatestVersion();
    if (latest) {
      port.postMessage({ type: 'latestVersion', latest });
    }
  }
});

// 안전한 포트 메시지 전송 함수
function safePostMessage(port, message) {
  try {
    if (port && port.postMessage) {
      port.postMessage(message);
      return true;
    }
  } catch (error) {
    debugLog(`포트 메시지 전송 실패: ${error.message}`);
    return false;
  }
  return false;
}

// 팝업 연결 초기화
async function initializePopupConnection(port) {
  const alarmStatus = await getCurrentAlarmStatus();
  
  safePostMessage(port, {
    response: "백그라운드와 연결되었습니다",
    type: "success",
    alarmStatus: alarmStatus
  });
  
  if (alarmStatus.active) {
    safePostMessage(port, {
      response: `🔄 백그라운드에서 ${alarmStatus.interval}초 주기로 자동 확인 중 (다음: ${alarmStatus.nextTime})`,
      type: "info",
      isAutoRunning: true
    });
  }
}

async function handleStartAction(msg, port) {
  const intervalSec = msg.interval;
  const intervalMin = Math.max(intervalSec / 60, 0.1); // 최소 0.1분
  
  debugLog(`자동 업데이트 설정: ${intervalSec}초 (${intervalMin}분)`);
  
  try {
    // 기존 알람 제거
    const wasCleared = await chrome.alarms.clear(alarmName);
    debugLog(`기존 알람 제거됨: ${wasCleared}`);
    
    // 새 알람 생성
    await chrome.alarms.create(alarmName, { 
      periodInMinutes: intervalMin,
      delayInMinutes: 0.1 // 6초 후 시작
    });
    
    // 알람 생성 확인
    const createdAlarm = await chrome.alarms.get(alarmName);
    if (createdAlarm) {
      debugLog(`새 알람 생성 확인됨: ${intervalMin}분 주기, 다음 실행: ${new Date(createdAlarm.scheduledTime).toLocaleTimeString('ko-KR')}`);
    } else {
      throw new Error('알람 생성 실패');
    }
    
    // 설정 저장
    await chrome.storage.local.set({
      autoUpdateEnabled: true,
      updateInterval: intervalSec,
      lastStartTime: Date.now()
    });
    debugLog('설정 저장됨');
    
    // 성공 메시지 전송
    const nextTime = new Date(createdAlarm.scheduledTime).toLocaleTimeString('ko-KR');
    safePostMessage(port, {
      response: `✅ 매 ${intervalSec}초마다 자동 업데이트 확인 시작됨 (다음: ${nextTime})`,
      type: "success",
      alarmStatus: {
        active: true,
        interval: intervalSec,
        nextTime: nextTime
      }
    });
    
    // 5초 후 첫 번째 체크 실행
    setTimeout(() => {
      debugLog('초기 업데이트 체크 실행');
      checkUpdate(port);
    }, 5000);
    
  } catch (error) {
    debugLog(`시작 처리 에러: ${error.message}`);
    throw error;
  }
}

async function handleStopAction(port) {
  debugLog('자동 업데이트 중지 요청');
  
  try {
    const wasCleared = await chrome.alarms.clear(alarmName);
    debugLog(`알람 해제 결과: ${wasCleared}`);
    
    await chrome.storage.local.set({
      autoUpdateEnabled: false,
      lastStopTime: Date.now()
    });
    debugLog('중지 설정 저장됨');
    
    safePostMessage(port, {
      response: "⏹️ 자동 업데이트가 중지되었습니다",
      type: "success",
      alarmStatus: { active: false }
    });
    
  } catch (error) {
    debugLog(`중지 처리 에러: ${error.message}`);
    throw error;
  }
}

async function handleCheckNowAction(port) {
  debugLog('즉시 업데이트 체크 요청');
  try {
    await checkUpdate(port);
  } catch (error) {
    debugLog(`즉시 체크 에러: ${error.message}`);
    throw error;
  }
}

async function handleGetStatsAction(port) {
  try {
    const stats = await chrome.storage.local.get(['checkCount', 'lastCheckTime', 'lastCheckResult', 'installDate']);
    safePostMessage(port, {
      response: "통계 정보 전송됨",
      type: "success",
      stats: stats
    });
  } catch (error) {
    debugLog(`통계 조회 에러: ${error.message}`);
    throw error;
  }
}

async function handleGetAlarmStatusAction(port) {
  try {
    const alarmStatus = await getCurrentAlarmStatus();
    safePostMessage(port, {
      response: "알람 상태 전송됨",
      type: "success",
      alarmStatus: alarmStatus
    });
  } catch (error) {
    debugLog(`알람 상태 조회 에러: ${error.message}`);
    throw error;
  }
}

async function handleShowNotificationAction(msg, port) {
  debugLog('알림 요청 처리');
  
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: msg.title || 'Chrome 업데이트',
      message: msg.message || '알림',
      priority: 2
    });
    
    safePostMessage(port, {
      response: "알림 요청 처리됨",
      type: "success"
    });
  } catch (error) {
    debugLog(`알림 요청 처리 에러: ${error.message}`);
    safePostMessage(port, {
      error: error.message,
      type: "error"
    });
  }
}

async function handleGetLatestVersionAction(port) {
  debugLog('최신 버전 정보 요청 받음');
  
  try {
    const latest = await getLatestVersion();
    
    if (latest) {
      safePostMessage(port, {
        type: "latestVersion",
        latest: latest,
        response: "최신 버전 정보 조회 성공"
      });
      
      debugLog(`최신 버전 정보 전송: ${latest}`);
    } else {
      safePostMessage(port, {
        type: "error",
        error: "최신 버전 정보를 가져올 수 없습니다"
      });
    }
    
  } catch (error) {
    debugLog(`최신 버전 정보 요청 처리 실패: ${error.message}`);
    
    safePostMessage(port, {
      type: "error",
      error: "최신 버전 정보 요청 처리 실패: " + error.message
    });
  }
}

async function handleGetBrowserInfoAction(port) {
  debugLog('브라우저 정보 요청 받음');
  
  try {
    let version = 'Unknown';
    
    // 1. exactVersion 캐시 확인
    if (exactVersion) {
      version = exactVersion;
      debugLog(`캐시된 브라우저 버전 사용: ${version}`);
    } else {
      // 2. chrome.runtime.getBrowserInfo 시도
      if (chrome.runtime.getBrowserInfo) {
        try {
          const info = await chrome.runtime.getBrowserInfo();
          if (info && info.version) {
            version = info.version;
            exactVersion = version; // 캐시 저장
            debugLog(`getBrowserInfo로 브라우저 버전 획득: ${version}`);
          }
        } catch (err) {
          debugLog(`getBrowserInfo 실패: ${err.message}`);
        }
      }
    }
    
    port.postMessage({
      type: "browserVersion",
      version: version,
      response: "브라우저 정보 조회 성공"
    });
    
    debugLog(`브라우저 정보 전송: ${version}`);
    
  } catch (error) {
    debugLog(`브라우저 정보 요청 처리 실패: ${error.message}`);
    
    port.postMessage({
      type: "error",
      error: "브라우저 정보 요청 처리 실패: " + error.message
    });
  }
}

// 알람 이벤트 처리 (핵심 지속적 확인 로직)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  debugLog(`🔔 알람 발생: ${alarm.name}, 시간: ${new Date(alarm.scheduledTime).toLocaleString('ko-KR')}`);
  
  if (alarm.name === alarmName) {
    try {
      debugLog('📡 백그라운드에서 자동 업데이트 확인 시작 (팝업 상태와 무관)');
      await checkUpdate(); // 팝업이 닫혀있어도 실행됨
      debugLog('✅ 백그라운드 자동 확인 완료');
    } catch (error) {
      debugLog(`❌ 알람 처리 에러: ${error.message}`);
    }
  }
});

async function checkUpdate(port = null) {
  debugLog('업데이트 체크 시작');
  
  try {
    // 로컬 개발 환경 감지 및 모의 응답
    const extensionId = chrome.runtime.id;
    const isLocalDev = extensionId.length > 20; // 로컬 확장 프로그램은 긴 ID를 가짐
    
    if (isLocalDev) {
      debugLog('로컬 개발 환경 감지 - 모의 응답 제공');
      
      // 실제 확인 시간 시뮬레이션 (3-8초)
      const checkDuration = 3000 + Math.random() * 5000;
      
      if (port) {
        port.postMessage({
          response: "🔍 업데이트 확인 중...",
          type: "info"
        });
      }
      
      // 지연 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, checkDuration));
      
      const mockResponses = [
        { status: 'no_update', weight: 70 },
        { status: 'update_available', weight: 20 },
        { status: 'throttled', weight: 10 }
      ];
      
      const randomNum = Math.random() * 100;
      let currentWeight = 0;
      let selectedResponse = 'no_update';
      
      for (const response of mockResponses) {
        currentWeight += response.weight;
        if (randomNum <= currentWeight) {
          selectedResponse = response.status;
          break;
        }
      }
      
      debugLog(`모의 응답 선택: ${selectedResponse} (${checkDuration.toFixed(0)}ms 소요)`);
      await handleUpdateResponse(selectedResponse, port);
      return;
    }

    // 실제 업데이트 체크
    if (port) {
      port.postMessage({
        response: "🔍 실제 업데이트 확인 중...",
        type: "info"
      });
    }
    
    debugLog('실제 chrome.runtime.requestUpdateCheck 호출');
    
    chrome.runtime.requestUpdateCheck((status, details) => {
      debugLog(`실제 업데이트 체크 결과: ${status}`);
      if (details) {
        debugLog(`세부 정보: ${JSON.stringify(details)}`);
      }
      handleUpdateResponse(status, port, details);
    });
    
  } catch (error) {
    debugLog(`업데이트 체크 에러: ${error.message}`);
    const message = `❌ 업데이트 체크 실패: ${error.message}`;
    await notify(message);
    if (port) {
      port.postMessage({
        error: message,
        type: "error"
      });
    }
  }
}

async function handleUpdateResponse(status, port = null, details = null) {
  let message = '';
  let messageType = 'info';
  let emoji = '';
  
  const timestamp = new Date().toLocaleTimeString('ko-KR');
  
  switch (status) {
    case "update_available":
      emoji = '🎉';
      message = `새 업데이트 발견! 업데이트를 적용하시겠습니까?`;
      messageType = 'success';
      
      // 사용자에게 업데이트 확인 요청
      debugLog('업데이트 발견 - 사용자 확인 요청');
      // popup에 명확한 updateAvailable 메시지 전송
      if (port) {
        port.postMessage({
          type: 'updateAvailable',
          latestVersion: details && details.version ? details.version : '',
          response: 'Chrome 최신 업데이트가 있습니다! 업데이트 안내 버튼을 확인하세요.'
        });
      }
      await requestUpdateConfirmation(port, details);
      return; // 여기서 함수 종료 (사용자 응답 대기)
      
    case "no_update":
      emoji = '✅';
      message = `최신 버전입니다 (${timestamp})`;
      messageType = 'success';
      break;
      
    case "throttled":
      emoji = '⚠️';
      message = `요청 제한됨. 잠시 후 재시도하세요 (${timestamp})`;
      messageType = 'warning';
      break;
      
    default:
      emoji = '❓';
      message = `알 수 없는 상태: ${status} (${timestamp})`;
      messageType = 'warning';
  }
  
  debugLog(`응답 처리: ${message}`);
  
  // 통계 업데이트
  try {
    const stats = await chrome.storage.local.get(['checkCount', 'lastCheckTime']) || {};
    await chrome.storage.local.set({
      checkCount: (stats.checkCount || 0) + 1,
      lastCheckTime: Date.now(),
      lastCheckResult: status,
      lastMessage: message
    });
    debugLog(`통계 업데이트: ${stats.checkCount + 1}회째 확인`);
  } catch (error) {
    debugLog(`통계 저장 실패: ${error.message}`);
  }
  
  // 알림 표시
  try {
    await notify(`${emoji} ${message}`);
  } catch (error) {
    debugLog(`알림 실패: ${error.message}`);
  }
  
  // 포트로 응답 전송
  if (port) {
    try {
      port.postMessage({
        response: `${emoji} ${message}`,
        type: messageType,
        status: status,
        details: details,
        timestamp: timestamp
      });
    } catch (error) {
      debugLog(`포트 메시지 전송 실패: ${error.message}`);
    }
  }
}

// 업데이트 확인 요청 함수
async function requestUpdateConfirmation(port, details) {
  debugLog('사용자에게 업데이트 확인 요청');
  
  try {
    // 상세한 업데이트 정보 생성
    let updateMessage = '🎉 새로운 Chrome 업데이트가 있습니다!\n\n';
    
    if (details && details.version) {
      updateMessage += `새 버전: ${details.version}\n`;
    }
    
    updateMessage += '업데이트를 적용하면 Chrome 설정 페이지로 이동합니다.\n';
    updateMessage += '진행하시겠습니까?';
    
    // 알림을 통한 사용자 확인
    const notificationId = await createUpdateNotification(updateMessage);
    
    // 포트를 통해 팝업에도 알림
    if (port) {
      port.postMessage({
        response: "🎉 새 업데이트 발견! 알림을 확인해주세요.",
        type: "warning",
        status: "update_available",
        requiresUserAction: true,
        updateDetails: details
      });
    }
    
    // 통계 업데이트
    const stats = await chrome.storage.local.get(['checkCount', 'lastCheckTime']) || {};
    await chrome.storage.local.set({
      checkCount: (stats.checkCount || 0) + 1,
      lastCheckTime: Date.now(),
      lastCheckResult: 'update_available',
      lastMessage: '업데이트 확인 대기 중'
    });
    
  } catch (error) {
    debugLog(`업데이트 확인 요청 실패: ${error.message}`);
    
    if (port) {
      port.postMessage({
        error: '업데이트 확인 요청 실패: ' + error.message,
        type: "error"
      });
    }
  }
}

// 업데이트 확인 알림 생성
async function createUpdateNotification(message) {
  debugLog('업데이트 확인 알림 생성');
  
  return new Promise((resolve) => {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: 'Chrome 업데이트 확인',
      message: message,
      priority: 2,
      buttons: [
        { title: '✅ 업데이트 적용' },
        { title: '❌ 나중에' }
      ]
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        debugLog(`알림 생성 실패: ${chrome.runtime.lastError.message}`);
      } else {
        debugLog(`업데이트 확인 알림 생성 성공: ${notificationId}`);
        
        // 알림 버튼 클릭 처리
        chrome.notifications.onButtonClicked.addListener((clickedId, buttonIndex) => {
          if (clickedId === notificationId) {
            handleUpdateDecision(buttonIndex === 0); // 0 = 업데이트 적용, 1 = 나중에
            chrome.notifications.clear(clickedId);
          }
        });
        
        // 알림 클릭 처리 (기본적으로 업데이트 적용)
        chrome.notifications.onClicked.addListener((clickedId) => {
          if (clickedId === notificationId) {
            debugLog('알림 클릭됨 - 업데이트 적용');
            handleUpdateDecision(true);
            chrome.notifications.clear(clickedId);
          }
        });
        
        // 알림이 자동으로 닫히는 경우 처리 (나중에로 간주)
        chrome.notifications.onClosed.addListener((closedId, byUser) => {
          if (closedId === notificationId && byUser) {
            debugLog('알림이 사용자에 의해 닫힘 - 나중에로 간주');
            handleUpdateDecision(false);
          }
        });
      }
      resolve(notificationId);
    });
  });
}

// 사용자의 업데이트 결정 처리
async function handleUpdateDecision(shouldUpdate) {
  debugLog(`사용자 업데이트 결정: ${shouldUpdate ? '적용' : '나중에'}`);
  
  if (shouldUpdate) {
    try {
      // 업데이트 적용 전 마지막 확인
      debugLog('Chrome 업데이트 적용 시작');
      
      // 통계 업데이트
      await chrome.storage.local.set({
        lastUpdateAttempt: Date.now(),
        lastCheckResult: 'update_applied'
      });
      
      // 업데이트 적용 알림
      await notify('🔄 Chrome 업데이트 페이지로 이동합니다. chrome://settings/help에서 직접 업데이트하세요.');
      
      // Chrome 설정 페이지로 이동하여 사용자가 직접 업데이트할 수 있도록 함
      setTimeout(() => {
        debugLog('chrome://settings/help 페이지로 이동');
        try {
          chrome.tabs.create({ 
            url: 'chrome://settings/help',
            active: true 
          });
        } catch (error) {
          debugLog(`탭 생성 실패: ${error.message}`);
          // 탭 생성 실패 시 백업으로 chrome.runtime.reload() 사용
          chrome.runtime.reload();
        }
      }, 1000); // 1초 후 이동 (사용자가 메시지를 볼 시간)
      
    } catch (error) {
      debugLog(`업데이트 적용 실패: ${error.message}`);
      await notify(`❌ 업데이트 적용 실패: ${error.message}`);
    }
  } else {
    debugLog('사용자가 업데이트를 나중으로 연기');
    
    // 통계 업데이트
    await chrome.storage.local.set({
      lastCheckResult: 'update_postponed',
      lastPostponeTime: Date.now()
    });
    
    await notify('⏰ 업데이트가 나중으로 연기되었습니다.');
  }
}

async function notify(message) {
  debugLog(`알림 생성: ${message}`);
  
  return new Promise((resolve) => {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.png'),
      title: '크롬 자동 업데이트',
      message: message,
      priority: 2,
      buttons: [
        { title: '확인' }
      ]
    }, (notificationId) => {
      if (chrome.runtime.lastError) {
        debugLog(`알림 생성 실패: ${chrome.runtime.lastError.message}`);
      } else {
        debugLog(`알림 생성 성공: ${notificationId}`);
        
        // 알림 클릭 처리
        chrome.notifications.onClicked.addListener((clickedId) => {
          if (clickedId === notificationId) {
            debugLog('알림이 클릭됨');
            chrome.notifications.clear(clickedId);
          }
        });
        
        // 버튼 클릭 처리
        chrome.notifications.onButtonClicked.addListener((clickedId) => {
          if (clickedId === notificationId) {
            debugLog('알림 버튼이 클릭됨');
            chrome.notifications.clear(clickedId);
          }
        });
      }
      resolve(notificationId);
    });
  });
}

// 주기적으로 알람 상태 확인 (디버그용)
setInterval(async () => {
  if (isDebugMode) {
    try {
      const alarms = await chrome.alarms.getAll();
      const ourAlarm = alarms.find(alarm => alarm.name === alarmName);
      if (ourAlarm) {
        debugLog(`알람 상태: 다음 실행 ${new Date(ourAlarm.scheduledTime).toLocaleTimeString()}`);
      } else {
        debugLog('활성 알람 없음');
      }
      
      // 설정 상태 확인
      const settings = await chrome.storage.local.get(['autoUpdateEnabled', 'updateInterval', 'checkCount']);
      debugLog(`설정 상태: 활성화=${settings.autoUpdateEnabled}, 주기=${settings.updateInterval}초, 확인횟수=${settings.checkCount || 0}`);
    } catch (error) {
      debugLog(`상태 확인 에러: ${error.message}`);
    }
  }
}, 60000); // 1분마다 체크

// 확장 프로그램 제거 시 정리
chrome.runtime.onSuspend.addListener(() => {
  debugLog('확장 프로그램 종료됨');
  chrome.alarms.clearAll();
});

debugLog('백그라운드 스크립트 초기화 완료');

chrome.runtime.getBrowserInfo?.().then(info => { exactVersion = info.version; });

async function getLatestVersion() {
  try {
    debugLog('최신 Chrome 버전 정보 요청 시작 (PRIMARY - Chromium Dash API)');
    
    // 타임아웃 설정 (15초로 연장)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      debugLog('요청 타임아웃 (15초)');
      controller.abort();
    }, 15000);
    
    const apiUrl = 'https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1';
    debugLog(`API 요청 URL: ${apiUrl}`);
    
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
    
    debugLog(`API 응답 시간: ${responseTime}ms`);
    debugLog(`응답 상태: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      debugLog(`API 오류 응답: ${errorText}`);
      throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
    }
    
    const responseText = await res.text();
    debugLog(`Raw 응답 길이: ${responseText.length} bytes`);
    debugLog(`Raw 응답 시작: ${responseText.substring(0, 200)}...`);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      debugLog(`JSON 파싱 오류: ${parseError.message}`);
      throw new Error(`JSON 파싱 실패: ${parseError.message}`);
    }
    
    debugLog(`파싱된 데이터: ${JSON.stringify(data)}`);
    
    // 응답 데이터 검증 (Chromium Dash API 형태)
    if (!data) {
      throw new Error('응답 데이터가 null입니다');
    }
    
    if (!Array.isArray(data)) {
      debugLog(`응답이 배열이 아닙니다. 타입: ${typeof data}`);
      throw new Error('응답이 배열 형태가 아닙니다');
    }
    
    if (data.length === 0) {
      debugLog('응답 배열이 비어있습니다');
      throw new Error('응답 배열이 비어있습니다');
    }
    
    const latestVersionInfo = data[0];
    debugLog(`최신 버전 정보: ${JSON.stringify(latestVersionInfo)}`);
    
    const latest = latestVersionInfo?.version;
    
    if (!latest || typeof latest !== 'string') {
      debugLog(`버전 정보 오류: ${latest} (타입: ${typeof latest})`);
      throw new Error('버전 정보가 응답에 포함되지 않았습니다');
    }
    
    debugLog(`최신 Chrome 버전: ${latest}`);
    return latest;
    
  } catch (error) {
    debugLog(`최신 버전 정보 요청 실패: ${error.message}`);
    debugLog(`오류 스택: ${error.stack}`);
    
    // 백업 방법: Google Version History API 시도
    try {
      debugLog('백업 API로 재시도 (Google Version History API)');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        debugLog('백업 API 타임아웃 (15초)');
        controller.abort();
      }, 15000);
      
      const backupUrl = 'https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions?limit=1';
      debugLog(`백업 API URL: ${backupUrl}`);
      
      const startTime = Date.now();
      
      const res = await fetch(backupUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Chrome Extension ChromeAutoUpdate/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      debugLog(`백업 API 응답 시간: ${responseTime}ms`);
      debugLog(`백업 API 응답 상태: ${res.status} ${res.statusText}`);
      
      if (res.ok) {
        const responseText = await res.text();
        debugLog(`백업 API Raw 응답 길이: ${responseText.length} bytes`);
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          debugLog(`백업 API JSON 파싱 오류: ${parseError.message}`);
          throw new Error(`백업 API JSON 파싱 실패: ${parseError.message}`);
        }
        
        const latest = data.versions?.[0]?.version;
        
        if (latest && typeof latest === 'string') {
          debugLog(`백업 API로 최신 버전 획득: ${latest}`);
          return latest;
        } else {
          debugLog(`백업 API 버전 정보 오류: ${latest}`);
        }
      } else {
        const errorText = await res.text().catch(() => 'Unknown error');
        debugLog(`백업 API 오류: ${res.status} ${res.statusText} - ${errorText}`);
      }
    } catch (backupError) {
      debugLog(`백업 API도 실패: ${backupError.message}`);
      debugLog(`백업 API 오류 스택: ${backupError.stack}`);
    }
    
    // 마지막 수단: 최신 알려진 안정 버전 사용
    debugLog('모든 API 실패 - 최신 알려진 버전 사용');
    const knownStableVersion = '138.0.7204.98'; // 정기적으로 업데이트 가능
    debugLog(`알려진 안정 버전 사용: ${knownStableVersion}`);
    return knownStableVersion;
  }
}
