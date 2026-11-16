"use strict";

const STORAGE_KEY = "cocolu-wound-care-v2";

const state = {
  nextAt: "",
  intervalHours: 24,
  editing: false,
  alertedFor: 0,
};

const elements = {
  reminderPanel: document.getElementById("reminderPanel"),
  reminderState: document.getElementById("reminderState"),
  dueAlert: document.getElementById("dueAlert"),
  nextLabel: document.getElementById("nextLabel"),
  nextTime: document.getElementById("nextTime"),
  countdown: document.getElementById("countdown"),
  scheduleForm: document.getElementById("scheduleForm"),
  startTime: document.getElementById("startTime"),
  intervalHours: document.getElementById("intervalHours"),
  intervalOptions: document.getElementById("intervalOptions"),
  saveButton: document.getElementById("saveButton"),
  reminderActions: document.getElementById("reminderActions"),
  doneButton: document.getElementById("doneButton"),
  notifyButton: document.getElementById("notifyButton"),
  calendarButton: document.getElementById("calendarButton"),
  editButton: document.getElementById("editButton"),
  musicCard: document.getElementById("musicCard"),
  musicStatus: document.getElementById("musicStatus"),
  musicToggle: document.getElementById("musicToggle"),
  musicProgress: document.getElementById("musicProgress"),
  backgroundMusic: document.getElementById("backgroundMusic"),
  supportNote: document.getElementById("supportNote"),
  toast: document.getElementById("toast"),
};

let toastTimer = 0;
let waitingForMusicGesture = false;

function getSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

function saveState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nextAt: state.nextAt,
        intervalHours: state.intervalHours,
      }),
    );
  } catch (error) {
    // The reminder still works while this page stays open.
  }
}

function hydrateState() {
  const saved = getSavedState();
  if (!saved) return;

  if (
    typeof saved.nextAt === "string" &&
    Number.isFinite(Date.parse(saved.nextAt))
  ) {
    state.nextAt = saved.nextAt;
  }

  if (
    Number.isFinite(saved.intervalHours) &&
    saved.intervalHours >= 1 &&
    saved.intervalHours <= 168
  ) {
    state.intervalHours = Math.round(saved.intervalHours);
  }
}

function isConfigured() {
  return Boolean(state.nextAt) && Number.isFinite(Date.parse(state.nextAt));
}

function isWeChatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toLocalInputValue(date) {
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function defaultStartDate() {
  const date = new Date(
    Date.now() + state.intervalHours * 60 * 60 * 1000,
  );
  date.setSeconds(0, 0);
  return date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatCountdown(distance) {
  const totalSeconds = Math.max(0, Math.ceil(distance / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `还有 ${days} 天 ${pad(hours)} 小时 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
  }
  return `还有 ${pad(hours)} 小时 ${pad(minutes)} 分 ${pad(seconds)} 秒`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function notificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return window.Notification.permission;
}

function updateSupportNote() {
  const permission = notificationPermission();
  let message =
    "换药计划只存储在当前设备中。退出网页后，请依靠手机日历提醒。";

  if (isWeChatBrowser()) {
    message =
      "微信内网页通知通常不可用，建议点“加入手机日历”。退出微信后，手机系统仍会提醒。";
  } else if (permission === "granted") {
    message =
      "页面通知已开启。浏览器允许时会在到期后提醒，仍建议同时加入手机日历。";
  } else if (permission === "denied") {
    message =
      "页面通知已被浏览器关闭。请使用“加入手机日历”获得更稳定的提醒。";
  } else if (permission === "unsupported") {
    message =
      "当前浏览器不支持网页通知，请使用“加入手机日历”接收系统提醒。";
  } else if (!window.isSecureContext) {
    message =
      "网页通知需要 HTTPS。正式发布后可以使用，或直接加入手机日历。";
  }

  elements.supportNote.textContent = message;
  elements.notifyButton.classList.toggle("is-enabled", permission === "granted");
  elements.notifyButton.setAttribute(
    "aria-pressed",
    String(permission === "granted"),
  );
}

function sendNotification(dueAt) {
  if (notificationPermission() !== "granted") return;
  try {
    const notification = new window.Notification("可可露，到了计划换药的时间", {
      body: `${formatDate(dueAt)}。先查看伤口和敷料，再按医护教的方法更换。`,
      tag: "cocolu-wound-dressing",
      renotify: true,
    });
    window.setTimeout(() => notification.close(), 15000);
  } catch (error) {
    // Embedded browsers may expose the API but still block notifications.
  }
}

function refreshReminder() {
  const configured = isConfigured();
  elements.reminderPanel.classList.toggle("is-configured", configured);
  elements.reminderActions.hidden = !configured;
  elements.scheduleForm.hidden = configured && !state.editing;
  elements.editButton.hidden = !configured || state.editing;
  updateSupportNote();

  if (!configured) {
    elements.reminderPanel.classList.remove("is-due");
    elements.dueAlert.hidden = true;
    elements.reminderState.textContent = "未设置";
    elements.nextLabel.textContent = "下一次换药";
    elements.nextTime.textContent = "还没有设置时间";
    elements.countdown.textContent =
      "填写首次时间和更换间隔后，这里会显示倒计时。";
    return;
  }

  const dueAt = new Date(state.nextAt);
  const distance = dueAt.getTime() - Date.now();
  const due = distance <= 0;

  elements.reminderPanel.classList.toggle("is-due", due);
  elements.dueAlert.hidden = !due;
  elements.reminderState.textContent = due ? "该换药了" : "计时中";

  if (due) {
    const overdueMinutes = Math.max(
      0,
      Math.floor((Date.now() - dueAt.getTime()) / 60000),
    );
    elements.nextLabel.textContent = "计划时间已经到了";
    elements.nextTime.textContent = `${formatDate(dueAt)} · 请及时处理`;
    elements.countdown.textContent =
      overdueMinutes > 0
        ? `已超过计划 ${overdueMinutes} 分钟。换好后点击“这次已经换好了”。`
        : "就是现在。换好后点击“这次已经换好了”。";

    if (state.alertedFor !== dueAt.getTime()) {
      state.alertedFor = dueAt.getTime();
      showToast("到了计划换药的时间，请先查看伤口情况");
      if (navigator.vibrate) {
        try {
          navigator.vibrate([180, 80, 180]);
        } catch (error) {
          // Vibration may require a recent user gesture.
        }
      }
      sendNotification(dueAt);
    }
  } else {
    elements.nextLabel.textContent = "下一次换药";
    elements.nextTime.textContent = formatDate(dueAt);
    elements.countdown.textContent = formatCountdown(distance);
  }
}

function syncIntervalControls(hours) {
  const normalized = Math.min(168, Math.max(1, Number(hours) || 24));
  state.intervalHours = Math.round(normalized);
  elements.intervalHours.value = String(state.intervalHours);
  elements.intervalOptions.querySelectorAll("button").forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.hours) === state.intervalHours,
    );
  });
}

function saveSchedule(event) {
  event.preventDefault();
  const start = new Date(elements.startTime.value);
  const hours = Number(elements.intervalHours.value);

  if (!Number.isFinite(start.getTime())) {
    showToast("请选择首次换药时间");
    elements.startTime.focus();
    return;
  }

  if (start.getTime() < Date.now() + 30000) {
    showToast("首次时间请选择一分钟以后");
    elements.startTime.focus();
    return;
  }

  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    showToast("间隔请填写 1 到 168 小时");
    elements.intervalHours.focus();
    return;
  }

  state.nextAt = start.toISOString();
  state.intervalHours = Math.round(hours);
  state.editing = false;
  state.alertedFor = 0;
  syncIntervalControls(state.intervalHours);
  saveState();
  refreshReminder();
  showToast(`换药计划已保存：${formatDate(start)}`);
}

function markAsDone() {
  if (!isConfigured()) return;
  const next = new Date(
    Date.now() + state.intervalHours * 60 * 60 * 1000,
  );
  next.setSeconds(0, 0);
  state.nextAt = next.toISOString();
  state.alertedFor = 0;
  state.editing = false;
  elements.startTime.value = toLocalInputValue(next);
  saveState();
  refreshReminder();
  showToast(`已记录本次换药，下次提醒：${formatDate(next)}`);
}

async function requestNotifications() {
  const permission = notificationPermission();

  if (isWeChatBrowser()) {
    showToast("微信内建议用“加入手机日历”来提醒");
    return;
  }

  if (permission === "unsupported") {
    showToast("当前浏览器不支持通知，请加入手机日历");
    return;
  }

  if (!window.isSecureContext) {
    showToast("网页通知需要 HTTPS，请先加入手机日历");
    return;
  }

  if (permission === "denied") {
    showToast("通知权限已关闭，可在浏览器设置中重新开启");
    return;
  }

  if (permission === "granted") {
    showToast("页面通知已经开启");
    return;
  }

  try {
    const result = await window.Notification.requestPermission();
    updateSupportNote();
    if (result === "granted") {
      showToast("页面通知已开启，建议再同步到手机日历");
      try {
        new window.Notification("换药提醒已开启", {
          body: "网页打开时会在计划时间提醒。关闭网页后请依靠手机日历。",
          tag: "cocolu-wound-dressing-enabled",
        });
      } catch (error) {
        // The visible toast still confirms the permission state.
      }
    } else {
      showToast("没有开启通知，可以改用手机日历");
    }
  } catch (error) {
    showToast("通知未能开启，请改用手机日历");
  }
}

function formatIcsLocal(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function formatIcsUtc(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadCalendar() {
  if (!isConfigured()) {
    showToast("请先保存换药计划");
    return;
  }

  const start = new Date(state.nextAt);
  const until = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const description =
    "按医生、护士或敷料说明更换敷料。保持伤口清洁和适宜湿度，不要自行延长换药间隔。若红肿扩大、疼痛加重、出现脓性渗液或异味、发热，请及时联系医护。";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cocoa Wound Care//Dressing Reminder//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:cocolu-wound-care-${start.getTime()}@wound-care.local`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART;TZID=Asia/Shanghai:${formatIcsLocal(start)}`,
    "DURATION:PT10M",
    `RRULE:FREQ=HOURLY;INTERVAL=${state.intervalHours};UNTIL=${formatIcsUtc(until)}`,
    "SUMMARY:可可露，按计划检查并更换敷料",
    `DESCRIPTION:${escapeIcsText(description)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    "DESCRIPTION:换药时间快到了，请先准备所需敷料",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "可可露-换药提醒.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(
    isWeChatBrowser()
      ? "日历已生成；微信若未打开，请点右上角用浏览器打开后再试"
      : "日历提醒已生成，打开文件并添加到手机日历",
  );
}

function updateMusicUI() {
  const audio = elements.backgroundMusic;
  const playing = !audio.paused && !audio.ended;
  elements.musicToggle.classList.toggle("is-playing", playing);
  elements.musicToggle.setAttribute(
    "aria-label",
    playing ? "暂停背景音乐" : "播放背景音乐",
  );
  elements.musicToggle.querySelector("span").textContent =
    playing ? "暂停" : "播放";
  elements.musicCard.classList.toggle("is-playing", playing);
  elements.musicStatus.textContent = playing
    ? "正在播放 · 官方试听"
    : waitingForMusicGesture
      ? "浏览器已拦截 · 点一下页面播放"
      : "已暂停 · 点击继续";
}

function enableMusicOnFirstClick() {
  if (waitingForMusicGesture) return;
  waitingForMusicGesture = true;
  document.addEventListener(
    "click",
    () => {
      attemptMusicPlay();
    },
    { once: true },
  );
}

async function attemptMusicPlay() {
  const audio = elements.backgroundMusic;
  try {
    audio.volume = 0.55;
    await audio.play();
    waitingForMusicGesture = false;
    updateMusicUI();
  } catch (error) {
    enableMusicOnFirstClick();
    updateMusicUI();
  }
}

function toggleMusic() {
  const audio = elements.backgroundMusic;
  if (audio.paused) {
    attemptMusicPlay();
  } else {
    audio.pause();
    waitingForMusicGesture = false;
    updateMusicUI();
  }
}

function bindEvents() {
  elements.scheduleForm.addEventListener("submit", saveSchedule);
  elements.intervalHours.addEventListener("input", () => {
    const hours = Number(elements.intervalHours.value);
    if (Number.isFinite(hours) && hours >= 1 && hours <= 168) {
      syncIntervalControls(hours);
    }
  });

  elements.intervalOptions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-hours]");
    if (!button) return;
    syncIntervalControls(button.dataset.hours);
  });

  elements.startTime.addEventListener("focus", () => {
    elements.startTime.min = toLocalInputValue(
      new Date(Date.now() + 60000),
    );
  });

  elements.doneButton.addEventListener("click", markAsDone);
  elements.notifyButton.addEventListener("click", requestNotifications);
  elements.calendarButton.addEventListener("click", downloadCalendar);
  elements.musicToggle.addEventListener("click", toggleMusic);
  elements.backgroundMusic.addEventListener("play", () => {
    waitingForMusicGesture = false;
    updateMusicUI();
  });
  elements.backgroundMusic.addEventListener("pause", updateMusicUI);
  elements.backgroundMusic.addEventListener("timeupdate", () => {
    const audio = elements.backgroundMusic;
    const progress =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? (audio.currentTime / audio.duration) * 100
        : 0;
    elements.musicProgress.style.width = `${progress}%`;
  });
  elements.editButton.addEventListener("click", () => {
    state.editing = true;
    refreshReminder();
    window.setTimeout(() => {
      elements.startTime.focus();
      elements.scheduleForm.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    }, 50);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshReminder();
  });
}

function init() {
  hydrateState();
  syncIntervalControls(state.intervalHours);
  elements.startTime.value = toLocalInputValue(
    isConfigured() ? new Date(state.nextAt) : defaultStartDate(),
  );
  elements.startTime.min = toLocalInputValue(
    new Date(Date.now() + 60000),
  );
  bindEvents();
  refreshReminder();
  window.setInterval(refreshReminder, 1000);
  attemptMusicPlay();
  document.addEventListener("WeixinJSBridgeReady", attemptMusicPlay, false);
}

init();
