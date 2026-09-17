from pathlib import Path

path = Path('index.html')
html = path.read_text(encoding='utf-8')

if 'csw-keyword-search-disclosure-v1-styles' in html:
    raise SystemExit('SAFE_STOP_KEYWORD_DISCLOSURE_ALREADY_PRESENT')

old = '''        <div class="keyword-search-block">
          <div class="keyword-search-heading"><span>KEYWORD SEARCH</span><strong>文字・情報から探す</strong></div>
          <div class="search-wrap"><label class="sr-only" for="search">品種や情報を検索</label><input id="search" type="search" autocomplete="off" placeholder="例：Bubble Gum、Kush、Humboldt CSI"></div>
          <p class="home-search-help">品種名・別名・ブリーダー／関連組織・generation・系譜・香り・テルペンまで自由に探せます</p>
        </div>'''

new = '''        <details class="keyword-search-disclosure" id="keyword-search-disclosure">
          <summary><span class="keyword-search-summary-copy"><span>KEYWORD SEARCH</span><strong>キーワード検索</strong></span><span class="keyword-search-chevron" aria-hidden="true">⌄</span></summary>
          <div class="keyword-search-panel">
            <div class="search-wrap"><label class="sr-only" for="search">品種や情報を検索</label><input id="search" type="search" autocomplete="off" placeholder="例：Bubble Gum、Kush、Humboldt CSI"></div>
            <p class="home-search-help">品種名・別名・ブリーダー／関連組織・generation・系譜・香り・テルペンまで自由に探せます</p>
          </div>
        </details>'''

count = html.count(old)
if count != 1:
    raise SystemExit(f'SAFE_STOP_KEYWORD_BLOCK_MATCH_COUNT:{count}')
html = html.replace(old, new, 1)

style = '''
  <style id="csw-keyword-search-disclosure-v1-styles">
    .keyword-search-disclosure{margin-top:12px;border-top:1px solid rgba(217,182,93,.14)}
    .keyword-search-disclosure>summary{display:flex;min-height:44px;align-items:center;gap:9px;padding:7px 1px 0;list-style:none;cursor:pointer;color:#d9c985}
    .keyword-search-disclosure>summary::-webkit-details-marker{display:none}
    .keyword-search-summary-copy{display:flex;min-width:0;align-items:baseline;gap:8px}
    .keyword-search-summary-copy>span{color:#8f8057;font-size:9px;font-weight:950;letter-spacing:.14em}
    .keyword-search-summary-copy>strong{color:#dfe7e1;font-size:12px;line-height:1.25}
    .keyword-search-chevron{margin-left:auto;color:#9f8d5b;font-size:15px;line-height:1;transition:transform .16s ease}
    .keyword-search-disclosure[open] .keyword-search-chevron{transform:rotate(180deg)}
    .keyword-search-panel{padding:8px 0 2px}
    .keyword-search-panel .home-search-help{margin:7px 3px 0}
    @media(max-width:699px){.keyword-search-summary-copy>span{font-size:10px}.keyword-search-summary-copy>strong{font-size:12px}}
  </style>
'''

if html.count('</head>') != 1:
    raise SystemExit('SAFE_STOP_HEAD_CLOSE_COUNT')
html = html.replace('</head>', style + '</head>', 1)

path.write_text(html, encoding='utf-8')
