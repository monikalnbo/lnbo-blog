<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title><xsl:value-of select="/rss/channel/title"/> · RSS 订阅源</title>
<link rel="stylesheet" href="/blog/assets/style.css?v=20260901-2"/>
<style>
body{max-width:820px;margin:0 auto;padding:52px 24px 80px}
.feed-head{border-bottom:3px double var(--accent);padding-bottom:26px;margin-bottom:8px}
.feed-head .kicker{margin-bottom:16px;display:flex;align-items:center;gap:14px}
.feed-head .kicker::after{content:"";flex:1;height:1px;background:var(--hairline)}
h1{font-family:var(--serif);font-size:34px;letter-spacing:.02em;margin-bottom:10px}
h1 em{font-style:normal;color:var(--accent)}
.sub{color:var(--muted);font-size:15px}
.how{background:var(--accent-soft);border-left:2px solid var(--accent);border-radius:0 6px 6px 0;
     padding:14px 18px;font-size:13.5px;color:var(--muted);margin:26px 0 8px;line-height:2}
.how b{color:var(--text)}
.how code{background:var(--card);border:1px solid var(--border);padding:2px 8px;border-radius:4px;
     font-family:var(--mono);font-size:12px;color:var(--accent);user-select:all}
.item{border-top:1px solid var(--hairline);padding:22px 4px 20px;display:grid;grid-template-columns:52px 1fr;gap:0 18px}
.item:last-child{border-bottom:1px solid var(--hairline)}
.item .no{font-family:var(--serif);font-style:italic;font-size:24px;color:var(--faint)}
.item h2{font-family:var(--serif);font-size:18.5px;line-height:1.55;margin:0 0 6px}
.item h2 a{color:var(--text);text-decoration:none;border-bottom:none}
.item h2 a:hover{color:var(--accent)}
.item .meta{font-family:var(--mono);font-size:11.5px;color:var(--faint);letter-spacing:.05em;margin-bottom:8px}
.item p{grid-column:2;color:var(--muted);font-size:14px;line-height:1.8;margin:0}
.feed-foot{margin-top:34px;text-align:center;color:var(--faint);font-family:var(--mono);font-size:11.5px;letter-spacing:.1em}
</style>
</head>
<body>
  <header class="feed-head">
    <div class="kicker"><span class="kicker">RSS Feed · 订阅源</span></div>
    <h1><em>文</em> · <xsl:value-of select="/rss/channel/title"/></h1>
    <div class="sub"><xsl:value-of select="/rss/channel/description"/></div>
  </header>
  <div class="how">
    📡 这是给 <b>RSS 阅读器</b>（如 NetNewsWire、Reeder、Feedly、Follow、Folo）准备的订阅源，人类看到这页说明一切正常。<br/>
    订阅方法：复制下面的地址，粘贴进你的阅读器即可——新文章会自动送达，无需来访。<br/>
    <code><xsl:value-of select="/rss/channel/atom:link/@href"/></code>
  </div>
  <main>
    <xsl:for-each select="/rss/channel/item">
      <article class="item">
        <div class="no"><xsl:number format="01"/></div>
        <h2><a>
          <xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
          <xsl:value-of select="title"/>
        </a></h2>
        <div class="meta"><xsl:value-of select="pubDate"/></div>
        <p><xsl:value-of select="description"/></p>
      </article>
    </xsl:for-each>
  </main>
  <footer class="feed-foot">
    <xsl:value-of select="count(/rss/channel/item)"/> ENTRIES · <xsl:value-of select="/rss/channel/link"/>
  </footer>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
