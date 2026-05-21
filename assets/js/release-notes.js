/* release-notes.js - GitHub API Commits Integration and Interactive Filtering */

const CONFIG = {
  owner: 'J105588',
  repo: 'tickets-new',
  commitsPerPage: 100,
  cacheKeyCommits: 'nticket.release_notes_commits',
  cacheKeyFetched: 'nticket.release_notes_last_fetched'
};

// Global state
let allCommits = [];
let activeCategory = 'all';
let searchQuery = '';

// Category definitions
const CATEGORIES = {
  all: { label: 'すべて', icon: '' },
  feat: { label: '機能追加', icon: '', pattern: /^(feat|feat\(.*\)):/i },
  fix: { label: '不具合修正', icon: '', pattern: /^(fix|fix\(.*\)):/i },
  docs: { label: 'ドキュメント', icon: '', pattern: /^(docs|docs\(.*\)):/i },
  refactor: { label: 'リファクタ', icon: '', pattern: /^(refactor|refactor\(.*\)):/i },
  chore: { label: 'ビルド・雑用', icon: '', pattern: /^(chore|chore\(.*\)):/i },
  perf: { label: '性能改善', icon: '', pattern: /^(perf|perf\(.*\)):/i },
  style: { label: 'コードスタイル', icon: '', pattern: /^(style|style\(.*\)):/i },
  test: { label: 'テスト', icon: '', pattern: /^(test|test\(.*\)):/i },
  other: { label: 'その他', icon: '' }
};

document.addEventListener('DOMContentLoaded', () => {
  initReleaseNotes();
});

// App Initialization
function initReleaseNotes() {
  setupSidebar();
  setupOnlineListeners();
  setupEventListeners();
  loadCachedCommits();

  // Auto fetch on load if online
  if (navigator.onLine) {
    refreshCommits();
  }
}

// Sidebar Setup
function setupSidebar() {
  if (window.loadSidebar) {
    window.loadSidebar();
  }
}

// Online/Offline handling
function setupOnlineListeners() {
  const updateStatus = () => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;

    if (navigator.onLine) {
      dot.className = 'status-dot online';
      text.textContent = 'オンライン';
      document.getElementById('refresh-btn').disabled = false;
    } else {
      dot.className = 'status-dot';
      text.textContent = 'オフライン';
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

// Event Listeners for Filters
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderTimeline();
    });
  }

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshCommits();
    });
  }
}

// Load cached data from localStorage
function loadCachedCommits() {
  try {
    const cached = localStorage.getItem(CONFIG.cacheKeyCommits);
    if (cached) {
      allCommits = JSON.parse(cached);
      updateLastFetchedTime();
      renderTabs();
      renderTimeline();
    } else {
      showEmptyState('キャッシュがありません。更新ボタンを押して最新のリリースノートをロードしてください。');
    }
  } catch (e) {
    console.error('Failed to load cached commits', e);
  }
}

// JST (UTC+9) time zone helper
function getJstDate(dateInput) {
  const date = new Date(dateInput);
  const jstTime = date.getTime() + (9 * 60 * 60 * 1000);
  return new Date(jstTime);
}

// Update the "Last fetched" display
function updateLastFetchedTime() {
  const lastFetchedEl = document.getElementById('last-fetched-time');
  if (!lastFetchedEl) return;

  const timestamp = localStorage.getItem(CONFIG.cacheKeyFetched);
  if (timestamp) {
    const jst = getJstDate(parseInt(timestamp));
    const yyyy = jst.getUTCFullYear();
    const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(jst.getUTCDate()).padStart(2, '0');
    const hh = String(jst.getUTCHours()).padStart(2, '0');
    const min = String(jst.getUTCMinutes()).padStart(2, '0');
    const sec = String(jst.getUTCSeconds()).padStart(2, '0');
    lastFetchedEl.textContent = `${yyyy}/${mm}/${dd} ${hh}:${min}:${sec} (JST)`;
  } else {
    lastFetchedEl.textContent = '未取得';
  }
}

// Fetch commits from GitHub REST API (handles pagination and smart merging)
async function refreshCommits() {
  const refreshBtn = document.getElementById('refresh-btn');
  const errorContainer = document.getElementById('error-container');

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('spinning');
  }

  if (errorContainer) {
    errorContainer.style.display = 'none';
    errorContainer.innerHTML = '';
  }

  try {
    let page = 1;
    let fetchedCommits = [];
    let hasMore = true;
    const maxPages = 10; // Safety limit to avoid rate limits

    // Read currently cached commits to check for overlap
    let cachedCommits = [];
    try {
      const cached = localStorage.getItem(CONFIG.cacheKeyCommits);
      if (cached) {
        cachedCommits = JSON.parse(cached);
      }
    } catch (e) {
      console.error('Failed to parse cached commits', e);
    }

    const cachedShas = new Set(cachedCommits.map(c => c.sha));

    while (hasMore && page <= maxPages) {
      const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/commits?per_page=${CONFIG.commitsPerPage}&page=${page}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('GitHub APIのレートリミット（リクエスト制限）に達しました。しばらく時間をおいてから再度お試しください。');
        }
        throw new Error(`GitHub API エラー (ステータス: ${response.status})`);
      }

      const rawData = await response.json();
      if (!Array.isArray(rawData) || rawData.length === 0) {
        hasMore = false;
        break;
      }

      const parsedPage = parseGitHubCommits(rawData);
      fetchedCommits = fetchedCommits.concat(parsedPage);

      // Check if any commit in the fetched page is already in our cache
      const hasOverlap = parsedPage.some(c => cachedShas.has(c.sha));

      // We only trust the overlap to stop fetching if our cache is already larger than one page.
      // If the cache has <= commitsPerPage, it might be incomplete (e.g. from a previous bug),
      // so we continue fetching to retrieve all historical commits.
      const isCacheComplete = cachedCommits.length > CONFIG.commitsPerPage;
      const shouldStop = (hasOverlap && isCacheComplete) || rawData.length < CONFIG.commitsPerPage;

      if (shouldStop) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Merge fetched commits with existing cached commits
    allCommits = mergeCommits(cachedCommits, fetchedCommits);

    // Save to Cache
    localStorage.setItem(CONFIG.cacheKeyCommits, JSON.stringify(allCommits));
    localStorage.setItem(CONFIG.cacheKeyFetched, Date.now().toString());

    updateLastFetchedTime();
    renderTabs();
    renderTimeline();

    // Show temporary glow effect on refresh indicator to wow user
    const text = document.getElementById('status-text');
    if (text) {
      const originalText = text.textContent;
      text.textContent = '更新完了!';
      text.style.color = '#10b981';
      setTimeout(() => {
        text.textContent = originalText;
        text.style.color = '';
      }, 2000);
    }

  } catch (err) {
    console.error('Failed to fetch commits:', err);
    showErrorMessage(err.message);

    // Fallback: If fetch failed but we have cache, notify that we are using cached data
    if (allCommits.length > 0) {
      const text = document.getElementById('status-text');
      if (text) {
        text.textContent = 'オフライン（キャッシュ表示中）';
      }
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = !navigator.onLine;
      refreshBtn.classList.remove('spinning');
    }
  }
}

// Helper to merge and sort commits by date descending, deduplicating by SHA
function mergeCommits(existing, fetched) {
  const mergedMap = new Map();
  
  if (Array.isArray(existing)) {
    existing.forEach(c => {
      if (c && c.sha) {
        mergedMap.set(c.sha, c);
      }
    });
  }
  
  if (Array.isArray(fetched)) {
    fetched.forEach(c => {
      if (c && c.sha) {
        mergedMap.set(c.sha, c);
      }
    });
  }
  
  return Array.from(mergedMap.values()).sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });
}


// Convert GitHub API structure into clean commit list
function parseGitHubCommits(commits) {
  return commits.map(item => {
    const sha = item.sha;
    const authorName = item.commit.author.name;
    const authorEmail = item.commit.author.email;
    const dateStr = item.commit.author.date;
    const message = item.commit.message;

    // Separate title (first line) and body/description
    const lines = message.split('\n');
    const title = lines[0].trim();
    const description = lines.slice(1).join('\n').trim();

    // Parse category
    let category = 'other';
    for (const [key, val] of Object.entries(CATEGORIES)) {
      if (val.pattern && val.pattern.test(title)) {
        category = key;
        break;
      }
    }

    // Attempt to clean up prefix from message if categorized
    let cleanMessage = title;
    if (category !== 'other') {
      const match = title.match(/^[^:]+:\s*(.*)$/);
      if (match && match[1]) {
        cleanMessage = match[1];
      }
    }

    // Get GitHub Profile info if present
    const authorLogin = item.author ? item.author.login : authorName;
    const authorAvatar = item.author ? item.author.avatar_url : 'https://github.com/identicons/' + authorLogin + '.png';
    const authorProfile = item.author ? item.author.html_url : 'https://github.com/' + authorLogin;

    return {
      sha: sha,
      shortSha: sha.substring(0, 7),
      title: cleanMessage,
      originalTitle: title,
      description: description,
      category: category,
      date: dateStr,
      author: {
        name: authorLogin,
        fullName: authorName,
        avatar: authorAvatar,
        profile: authorProfile
      }
    };
  });
}

// Render the category tabs
function renderTabs() {
  const container = document.getElementById('filter-tabs');
  if (!container) return;

  // Calculate counts for each category
  const counts = { all: allCommits.length };
  for (const key of Object.keys(CATEGORIES)) {
    if (key !== 'all') {
      counts[key] = allCommits.filter(c => c.category === key).length;
    }
  }

  let html = '';
  for (const [key, category] of Object.entries(CATEGORIES)) {
    const isActive = activeCategory === key;
    const count = counts[key] || 0;

    // Skip rendering categories that have 0 commits, except 'all' and 'feat' / 'fix'
    if (count === 0 && key !== 'all' && key !== 'feat' && key !== 'fix') {
      continue;
    }

    html += `
      <button class="filter-tab ${isActive ? 'active' : ''}" onclick="selectCategory('${key}')">
        <span>${category.icon}</span>
        <span>${category.label}</span>
        <span class="count-badge">${count}</span>
      </button>
    `;
  }

  container.innerHTML = html;
}

// Switch category callback
window.selectCategory = function (categoryKey) {
  activeCategory = categoryKey;
  renderTabs();
  renderTimeline();
};

// Toggle commit description expansion
window.toggleCommitExpand = function (cardElement) {
  if (cardElement) {
    cardElement.classList.toggle('expanded');
    const hint = cardElement.querySelector('.expand-hint span');
    if (hint) {
      hint.textContent = cardElement.classList.contains('expanded') ? '詳細を閉じる' : '詳細を表示';
    }
  }
};

// Render the timeline
function renderTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  // Filter commits
  const filtered = allCommits.filter(c => {
    // 1. Category Filter
    if (activeCategory !== 'all' && c.category !== activeCategory) {
      return false;
    }
    // 2. Search Keyword Filter
    if (searchQuery) {
      const inTitle = c.originalTitle.toLowerCase().includes(searchQuery);
      const inDesc = c.description.toLowerCase().includes(searchQuery);
      const inHash = c.sha.toLowerCase().includes(searchQuery);
      const inAuthor = c.author.name.toLowerCase().includes(searchQuery);
      return inTitle || inDesc || inHash || inAuthor;
    }
    return true;
  });

  if (filtered.length === 0) {
    showEmptyState(searchQuery ? '検索条件に一致するアップデート情報が見つかりませんでした。' : 'このカテゴリのリリース情報はありません。');
    return;
  }

  // Group by Date (JST calendar date)
  const groups = {};
  filtered.forEach(commit => {
    const commitDate = new Date(commit.date);
    const dateStr = formatDateGroup(commitDate);
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(commit);
  });

  let html = '<div class="timeline">';
  let absoluteIndex = 0; // for stagger animation delay

  for (const [dateStr, commits] of Object.entries(groups)) {
    html += `
      <div class="timeline-group">
        <div class="date-header">${dateStr}</div>
    `;

    commits.forEach(commit => {
      const category = CATEGORIES[commit.category] || CATEGORIES.other;
      const relativeTime = getRelativeTimeString(commit.date);
      const hasDescription = commit.description.length > 0;

      html += `
        <div class="timeline-item" style="animation-delay: ${absoluteIndex * 0.05}s">
          <div class="commit-card" onclick="toggleCommitExpand(this)">
            <div class="commit-header">
              <div class="commit-meta-left">
                <span class="category-badge badge-${commit.category}">${category.icon} ${category.label}</span>
                <a href="https://github.com/${CONFIG.owner}/${CONFIG.repo}/commit/${commit.sha}" 
                   target="_blank" 
                   class="commit-hash" 
                   onclick="event.stopPropagation()">${commit.shortSha}</a>
              </div>
              <span class="commit-time" title="${formatFullDate(commit.date)}">${relativeTime}</span>
            </div>
            
            <p class="commit-message">${escapeHtml(commit.title)}</p>
            
            ${hasDescription ? `
              <div class="commit-description">${escapeHtml(commit.description)}</div>
            ` : ''}

            <div class="commit-footer">
              <a href="${commit.author.profile}" 
                 target="_blank" 
                 class="author-info" 
                 onclick="event.stopPropagation()">
                <img src="${commit.author.avatar}" alt="${commit.author.name}" class="author-avatar" />
                <span>${escapeHtml(commit.author.name)}</span>
              </a>
              ${hasDescription ? `
                <div class="expand-hint">
                  <span>詳細を表示</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
      absoluteIndex++;
    });

    html += `</div>`; // timeline-group
  }

  html += '</div>'; // timeline
  container.innerHTML = html;
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateGroup(date) {
  const jst = getJstDate(date);
  const yyyy = jst.getUTCFullYear();
  const mm = jst.getUTCMonth() + 1;
  const dd = jst.getUTCDate();
  const dayIndex = jst.getUTCDay();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${yyyy}年${mm}月${dd}日 (${days[dayIndex]})`;
}

function formatFullDate(dateStr) {
  const jst = getJstDate(dateStr);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min} JST`;
}

function getRelativeTimeString(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) {
    return 'たった今';
  } else if (diffMin < 60) {
    return `${diffMin}分前`;
  } else if (diffHour < 24) {
    return `${diffHour}時間前`;
  } else {
    // Check if yesterday in JST
    const jstDate = getJstDate(date);
    const jstNow = getJstDate(now);

    const jstYesterday = new Date(jstNow.getTime() - 24 * 60 * 60 * 1000);
    const isYesterday = jstYesterday.getUTCFullYear() === jstDate.getUTCFullYear() &&
                        jstYesterday.getUTCMonth() === jstDate.getUTCMonth() &&
                        jstYesterday.getUTCDate() === jstDate.getUTCDate();
    if (isYesterday) {
      return '昨日';
    }

    // Otherwise return day count (up to 7 days)
    const diffDays = Math.floor(diffHour / 24);
    if (diffDays < 7) {
      return `${diffDays}日前`;
    }

    // Default to JST absolute short date
    const mm = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(jstDate.getUTCDate()).padStart(2, '0');
    return `${mm}/${dd}`;
  }
}

function showEmptyState(message) {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">🔍</span>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function showErrorMessage(message) {
  const container = document.getElementById('error-container');
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = `
    <div class="error-state">
      <h3 class="error-title">
        <span>⚠️</span> 接続エラー
      </h3>
      <p class="error-message">${escapeHtml(message)}</p>
    </div>
  `;
}
