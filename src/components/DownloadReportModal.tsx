'use client';
import { useState, useRef, useEffect } from 'react';

const GOOGLE_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbzT3aj10Jj9eFGuVON7c4t5e1gRImBfmm3rXMs6VvmYw4mFUICdsdn6GSFbQYaPpc2d/exec';

interface DownloadReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportUrl: string;
  overallScore: number;
  reportData: any; // full SEOReport
  isDark: boolean;
}

type ModalStep = 'email' | 'generating' | 'done' | 'error';

// ─── helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 80 ? '#00f5a0' : s >= 60 ? '#ffb700' : '#ff4060';
}
function grade(s: number) {
  return s >= 90 ? 'A+' : s >= 80 ? 'A' : s >= 70 ? 'B' : s >= 60 ? 'C' : s >= 50 ? 'D' : 'F';
}
function fmt(v: any) {
  if (v === null || v === undefined) return 'N/A';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

async function buildPDF(reportData: any): Promise<Blob> {
  // @ts-ignore
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const MARGIN = 14;
  const COL = W - MARGIN * 2;
  const PAGE_H = 297;
  const FOOTER_H = 14;
  let y = 0;

  // ── colour palette ──────────────────────────────────────────
  const C = {
    bg: [10, 16, 30] as [number, number, number],
    surface: [16, 24, 44] as [number, number, number],
    border: [30, 45, 70] as [number, number, number],
    cyan: [0, 212, 255] as [number, number, number],
    green: [0, 245, 160] as [number, number, number],
    yellow: [255, 183, 0] as [number, number, number],
    red: [255, 64, 96] as [number, number, number],
    white: [240, 245, 255] as [number, number, number],
    text2: [120, 150, 190] as [number, number, number],
    text3: [70, 95, 130] as [number, number, number],
  };

  const sc = (s: number): [number, number, number] =>
    s >= 80 ? C.green : s >= 60 ? C.yellow : C.red;

  // ── helpers ──────────────────────────────────────────────────
  function newPage() {
    doc.addPage();
    // bg
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, W, PAGE_H, 'F');
    // footer
    doc.setFillColor(...C.surface);
    doc.rect(0, PAGE_H - FOOTER_H, W, FOOTER_H, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...C.text3);
    doc.text(`DEEPSEO v3.1  ·  ${reportData.url}`, MARGIN, PAGE_H - 5);
    doc.text(`Page ${doc.getNumberOfPages()}`, W - MARGIN, PAGE_H - 5, { align: 'right' });
    y = 18;
  }

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - FOOTER_H - 8) newPage();
  }

  function sectionHeader(title: string, score?: number) {
    ensureSpace(14);
    doc.setFillColor(...C.surface);
    doc.roundedRect(MARGIN, y, COL, 10, 2, 2, 'F');
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, COL, 10, 2, 2, 'S');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const col = score !== undefined ? sc(score) : C.cyan;
    doc.setTextColor(...col);
    doc.text(title.toUpperCase(), MARGIN + 4, y + 6.5);

    if (score !== undefined) {
      doc.setFontSize(7.5);
      doc.setTextColor(...col);
      doc.text(`${score}/100`, W - MARGIN - 4, y + 6.5, { align: 'right' });
    }
    y += 13;
  }

  function issueRow(text: string, type: 'ok' | 'warn' | 'error' = 'warn') {
    const icon = type === 'ok' ? '✓' : type === 'error' ? '✗' : '⚠';
    const col = type === 'ok' ? C.green : type === 'error' ? C.red : C.yellow;
    const lines = doc.splitTextToSize(text, COL - 22);
    const h = lines.length * 4.5 + 5;
    ensureSpace(h);

    doc.setFillColor(...col.map((v) => Math.round(v * 0.06)) as [number, number, number]);
    doc.roundedRect(MARGIN, y, COL, h, 1.5, 1.5, 'F');
    doc.setDrawColor(...col);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, y + 1.5, MARGIN, y + h - 1.5);
    doc.setLineWidth(0.3);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...col);
    doc.text(icon, MARGIN + 3, y + h / 2 + 1.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(lines, MARGIN + 9, y + 4.5, { lineHeightFactor: 1.4 });
    y += h + 2;
  }

  function checkRow(label: string, value: string, pass: boolean) {
    ensureSpace(8);
    doc.setFillColor(...C.surface);
    doc.roundedRect(MARGIN, y, COL, 7, 1, 1, 'F');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const passColor = pass ? C.green : C.red;
    doc.setTextColor(...passColor);
    doc.text(pass ? '✓' : '✗', MARGIN + 2.5, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text2);
    doc.text(label, MARGIN + 8, y + 4.8);

    doc.setTextColor(...C.white);
    const val = doc.splitTextToSize(value, 65)[0] || '';
    doc.text(val, W - MARGIN - 2, y + 4.8, { align: 'right' });
    y += 8.5;
  }

  function statRow(label: string, value: string, color?: [number, number, number]) {
    ensureSpace(7);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.text2);
    doc.setFont('helvetica', 'normal');
    doc.text(label, MARGIN + 2, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(color || C.cyan));
    doc.text(value, W - MARGIN - 2, y + 4, { align: 'right' });
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 6.5, W - MARGIN, y + 6.5);
    y += 7;
  }

  function scoreRing(cx: number, cy: number, r: number, s: number, label: string) {
    const col = sc(s);
    // background circle
    doc.setDrawColor(...C.border);
    doc.setLineWidth(2);
    doc.circle(cx, cy, r, 'S');
    // arc (approximate with filled arc using lines — jsPDF doesn't have arc stroke natively)
    // draw a thick arc using many short lines
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (s / 100) * 2 * Math.PI;
    const steps = Math.max(1, Math.round((s / 100) * 48));
    doc.setDrawColor(...col);
    doc.setLineWidth(2.2);
    for (let i = 0; i < steps; i++) {
      const a1 = startAngle + (i / steps) * (endAngle - startAngle);
      const a2 = startAngle + ((i + 1) / steps) * (endAngle - startAngle);
      doc.line(cx + r * Math.cos(a1), cy + r * Math.sin(a1), cx + r * Math.cos(a2), cy + r * Math.sin(a2));
    }
    // score text
    doc.setFontSize(r > 8 ? 8 : 6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...col);
    doc.text(String(s), cx, cy + 1.5, { align: 'center' });
    // label
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text2);
    doc.text(label, cx, cy + r + 4.5, { align: 'center' });
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 1 — Cover
  // ═══════════════════════════════════════════════════════════

  // Background
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, W, PAGE_H, 'F');

  // Top accent bar
  doc.setFillColor(...C.cyan);
  doc.rect(0, 0, W, 1.2, 'F');

  // Logo area
  y = 24;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.cyan);
  doc.text('◈  DEEPSEO', MARGIN, y);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text3);
  doc.text('v3.1', MARGIN + 31, y);

  // Date right
  doc.setFontSize(7);
  doc.setTextColor(...C.text3);
  doc.text(new Date(reportData.timestamp).toLocaleString(), W - MARGIN, y, { align: 'right' });

  // Divider
  y += 6;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 14;

  // Hero title
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('SEO ANALYSIS', MARGIN, y);
  y += 10;
  doc.setFontSize(26);
  doc.setTextColor(...C.cyan);
  doc.text('REPORT', MARGIN, y);
  y += 14;

  // URL badge
  doc.setFillColor(...C.surface);
  doc.roundedRect(MARGIN, y, COL, 11, 2, 2, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, COL, 11, 2, 2, 'S');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.cyan);
  doc.text('↗  ' + reportData.url, MARGIN + 4, y + 7.2);
  y += 20;

  // Big grade + score
  const gradeStr = grade(reportData.overallScore);
  doc.setFontSize(72);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...sc(reportData.overallScore));
  doc.text(gradeStr, MARGIN, y + 50);

  doc.setFontSize(38);
  doc.setTextColor(...C.white);
  doc.text(`${reportData.overallScore}`, MARGIN + 42, y + 38);
  doc.setFontSize(16);
  doc.setTextColor(...C.text3);
  doc.text('/100', MARGIN + 42 + doc.getTextWidth(String(reportData.overallScore)) + 2, y + 38);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text2);
  doc.text('OVERALL SEO SCORE', MARGIN + 42, y + 46);
  y += 62;

  // Score rings row
  const ringsData = [
    { score: reportData.onPage?.score ?? 0, label: 'On-Page' },
    { score: reportData.technical?.score ?? 0, label: 'Technical' },
    { score: reportData.crawl?.score ?? 0, label: 'Crawl' },
    { score: reportData.security?.score ?? 0, label: 'Security' },
    { score: reportData.rendering?.score ?? 0, label: 'Rendering' },
    { score: reportData.social?.score ?? 0, label: 'Social' },
    { score: reportData.content?.score ?? 0, label: 'Content' },
    { score: reportData.amp?.score ?? 0, label: 'AMP' },
    { score: reportData.intelligence?.score ?? 0, label: 'Intel' },
  ];

  const ringR = 9;
  const ringSpacing = COL / ringsData.length;
  ringsData.forEach((rd, i) => {
    const cx = MARGIN + ringSpacing * i + ringSpacing / 2;
    scoreRing(cx, y + ringR + 2, ringR, rd.score, rd.label);
  });
  y += ringR * 2 + 16;

  // Summary stats strip
  doc.setFillColor(...C.surface);
  doc.roundedRect(MARGIN, y, COL, 30, 3, 3, 'F');
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, COL, 30, 3, 3, 'S');

  const statsStrip = [
    { label: 'Words', value: (reportData.content?.wordCount ?? 0).toLocaleString() },
    { label: 'Internal Links', value: String(reportData.onPage?.links?.internal ?? 0) },
    { label: 'Images', value: String(reportData.onPage?.images?.total ?? 0) },
    { label: 'HTTPS', value: reportData.security?.https ? 'Yes' : 'No' },
    { label: 'Structured Data', value: reportData.technical?.structuredData?.found ? 'Yes' : 'No' },
    { label: 'H1 Tags', value: String(reportData.onPage?.headings?.h1?.length ?? 0) },
  ];
  const sw = COL / statsStrip.length;
  statsStrip.forEach((s, i) => {
    const cx = MARGIN + sw * i + sw / 2;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.cyan);
    doc.text(s.value, cx, y + 13, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text2);
    doc.text(s.label.toUpperCase(), cx, y + 20, { align: 'center' });
  });
  y += 36;

  // Footer
  doc.setFillColor(...C.surface);
  doc.rect(0, PAGE_H - FOOTER_H, W, FOOTER_H, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...C.text3);
  doc.text(`DEEPSEO v3.1  ·  ${reportData.url}`, MARGIN, PAGE_H - 5);
  doc.text(`Page 1`, W - MARGIN, PAGE_H - 5, { align: 'right' });

  // ═══════════════════════════════════════════════════════════
  //  PAGE 2 — Issues & On-Page
  // ═══════════════════════════════════════════════════════════
  newPage();

  // All issues
  sectionHeader('All Issues Found');
  const allIssues = [
    ...(reportData.onPage?.title?.issues ?? []),
    ...(reportData.onPage?.metaDescription?.issues ?? []),
    ...(reportData.onPage?.headings?.issues ?? []),
    ...(reportData.technical?.issues ?? []),
    ...(reportData.crawl?.issues ?? []),
    ...(reportData.security?.issues ?? []),
    ...(reportData.rendering?.issues ?? []),
    ...(reportData.content?.issues ?? []),
    ...(reportData.social?.issues ?? []),
    ...(reportData.intelligence?.eeat?.gaps ?? []),
  ];
  if (allIssues.length === 0) {
    issueRow('No critical issues found — great job!', 'ok');
  } else {
    allIssues.slice(0, 18).forEach((iss) => {
      const t = iss.toLowerCase();
      issueRow(iss, t.includes('critical') || t.includes('not found') || t.includes('noindex') ? 'error' : 'warn');
    });
    if (allIssues.length > 18) {
      issueRow(`+ ${allIssues.length - 18} more issues not shown`, 'warn');
    }
  }

  y += 4;
  sectionHeader('On-Page SEO', reportData.onPage?.score);

  // Title
  statRow('Title', reportData.onPage?.title?.content?.slice(0, 55) || 'Not set', C.white);
  statRow('Title length', `${reportData.onPage?.title?.length ?? 0}/60 chars`, reportData.onPage?.title?.length <= 60 ? C.green : C.red);
  statRow('Meta description', reportData.onPage?.metaDescription?.content?.slice(0, 55) || 'Not set', C.white);
  statRow('Meta desc length', `${reportData.onPage?.metaDescription?.length ?? 0}/160 chars`, reportData.onPage?.metaDescription?.length <= 160 ? C.green : C.yellow);
  statRow('H1 count', String(reportData.onPage?.headings?.h1?.length ?? 0), reportData.onPage?.headings?.h1?.length === 1 ? C.green : C.red);
  statRow('H2 count', String(reportData.onPage?.headings?.h2?.length ?? 0), C.cyan);
  statRow('Internal links', String(reportData.onPage?.links?.internal ?? 0), C.cyan);
  statRow('External links', String(reportData.onPage?.links?.external ?? 0), C.yellow);
  statRow('Total images', String(reportData.onPage?.images?.total ?? 0), C.cyan);
  statRow('Images without alt', String(reportData.onPage?.images?.withoutAlt ?? 0), reportData.onPage?.images?.withoutAlt > 0 ? C.red : C.green);

  // ═══════════════════════════════════════════════════════════
  //  PAGE 3 — Technical & Crawl & Security
  // ═══════════════════════════════════════════════════════════
  newPage();
  sectionHeader('Technical SEO', reportData.technical?.score);
  checkRow('Canonical URL', fmt(reportData.technical?.canonical), !!reportData.technical?.canonical);
  checkRow('HTTPS / HTTP→HTTPS', fmt(reportData.technical?.httpToHttps), reportData.technical?.httpToHttps);
  checkRow('Viewport meta', fmt(reportData.technical?.viewport), !!reportData.technical?.viewport);
  checkRow('HTML lang attribute', fmt(reportData.technical?.lang), !!reportData.technical?.lang);
  checkRow('robots.txt accessible', reportData.technical?.robotsTxt?.accessible ? 'Yes' : 'Not found', reportData.technical?.robotsTxt?.accessible);
  checkRow('Sitemap linked', fmt(reportData.technical?.sitemapLinked), reportData.technical?.sitemapLinked);
  checkRow('Structured Data', reportData.technical?.structuredData?.found ? reportData.technical.structuredData.types.join(', ') : 'None', reportData.technical?.structuredData?.found);
  checkRow('Hreflang', reportData.technical?.hreflang?.length > 0 ? reportData.technical.hreflang.join(', ') : 'None', reportData.technical?.hreflang?.length > 0);
  checkRow('Charset', fmt(reportData.technical?.charset), !!reportData.technical?.charset);

  y += 4;
  sectionHeader('Crawl Analysis', reportData.crawl?.score);
  checkRow('Indexable', fmt(reportData.crawl?.indexable), reportData.crawl?.indexable);
  checkRow('Not robots-blocked', fmt(!reportData.crawl?.robotsBlocked), !reportData.crawl?.robotsBlocked);
  checkRow('No nofollow page-level', fmt(!reportData.crawl?.nofollowPage), !reportData.crawl?.nofollowPage);
  checkRow('Canonical correct', fmt(reportData.crawl?.canonicalCorrect), reportData.crawl?.canonicalCorrect);
  checkRow('Pagination tags', fmt(reportData.crawl?.paginationTags), true);
  checkRow('AMP version', fmt(reportData.crawl?.ampVersion), true);
  statRow('Internal links found', String(reportData.crawl?.internalLinks?.length ?? 0), C.cyan);

  y += 4;
  sectionHeader('Security', reportData.security?.score);
  checkRow('HTTPS', fmt(reportData.security?.https), reportData.security?.https);
  checkRow('HSTS header', fmt(reportData.security?.hsts), reportData.security?.hsts);
  checkRow('Content-Security-Policy', fmt(reportData.security?.csp), reportData.security?.csp);
  checkRow('X-Frame-Options', fmt(reportData.security?.xFrameOptions), reportData.security?.xFrameOptions);
  checkRow('Mixed content', !reportData.security?.mixedContent ? 'Clean' : 'Detected', !reportData.security?.mixedContent);

  // ═══════════════════════════════════════════════════════════
  //  PAGE 4 — Content & Rendering & Social
  // ═══════════════════════════════════════════════════════════
  newPage();
  sectionHeader('Content Quality', reportData.content?.score);
  statRow('Word count', (reportData.content?.wordCount ?? 0).toLocaleString(), reportData.content?.wordCount >= 600 ? C.green : C.yellow);
  statRow('Paragraph count', String(reportData.content?.paragraphCount ?? 0), C.cyan);
  statRow('Readability score', `${reportData.content?.readabilityScore ?? 0}%`, reportData.content?.readabilityScore >= 60 ? C.green : C.yellow);
  statRow('Reading grade level', fmt(reportData.content?.readabilityGrade), C.cyan);
  statRow('Avg sentence length', `${reportData.content?.avgSentenceLength ?? 0} words`, C.cyan);
  statRow('Content/code ratio', `${reportData.content?.contentToCodeRatio ?? 0}%`, reportData.content?.contentToCodeRatio >= 20 ? C.green : C.yellow);

  y += 4;
  sectionHeader('Rendering', reportData.rendering?.score);
  checkRow('Lazy loading images', fmt(reportData.rendering?.lazyLoadImages), reportData.rendering?.lazyLoadImages);
  checkRow('No JS render required', !reportData.rendering?.jsRenderRequired ? 'Static' : 'JS needed', !reportData.rendering?.jsRenderRequired);
  checkRow('No Flash/Object', !reportData.rendering?.flashContent ? 'None' : 'Found', !reportData.rendering?.flashContent);
  checkRow('iFrames', `${reportData.rendering?.iframes ?? 0} found`, reportData.rendering?.iframes === 0);
  checkRow('Blocking CSS files', `${reportData.rendering?.cssBlocking ?? 0}`, reportData.rendering?.cssBlocking <= 3);
  checkRow('Blocking JS scripts', `${reportData.rendering?.jsBlocking ?? 0}`, reportData.rendering?.jsBlocking <= 3);

  y += 4;
  sectionHeader('Social / Open Graph', reportData.social?.score);
  checkRow('og:title', fmt(reportData.social?.ogTitle), !!reportData.social?.ogTitle);
  checkRow('og:description', fmt(reportData.social?.ogDescription), !!reportData.social?.ogDescription);
  checkRow('og:image', reportData.social?.ogImage ? 'Set' : 'Missing', !!reportData.social?.ogImage);
  checkRow('og:type', fmt(reportData.social?.ogType), !!reportData.social?.ogType);
  checkRow('twitter:card', fmt(reportData.social?.twitterCard), !!reportData.social?.twitterCard);
  checkRow('twitter:title', fmt(reportData.social?.twitterTitle), !!reportData.social?.twitterTitle);

  // ═══════════════════════════════════════════════════════════
  //  PAGE 5 — Intelligence & Keywords
  // ═══════════════════════════════════════════════════════════
  newPage();
  if (reportData.intelligence) {
    const intel = reportData.intelligence;
    sectionHeader('Intelligence — E-E-A-T Signals', intel.eeat?.score);
    const eeat = intel.eeat;
    if (eeat) {
      checkRow('Author meta tag', fmt(eeat.signals?.hasAuthorMeta), eeat.signals?.hasAuthorMeta);
      checkRow('Article schema (JSON-LD)', fmt(eeat.signals?.hasArticleSchema), eeat.signals?.hasArticleSchema);
      checkRow('Organization schema', fmt(eeat.signals?.hasOrgSchema), eeat.signals?.hasOrgSchema);
      checkRow('About page linked', fmt(eeat.signals?.hasAbout), eeat.signals?.hasAbout);
      checkRow('Contact page linked', fmt(eeat.signals?.hasContact), eeat.signals?.hasContact);
      checkRow('Privacy/Terms linked', fmt(eeat.signals?.hasPolicy), eeat.signals?.hasPolicy);
      checkRow('Review content', fmt(eeat.signals?.hasReviews), eeat.signals?.hasReviews);
      checkRow('Authoritative citations', String(eeat.signals?.citationsCount ?? 0), (eeat.signals?.citationsCount ?? 0) > 0);
    }

    y += 4;
    sectionHeader('Search Intent Detection');
    if (intel.intent) {
      statRow('Detected intent', intel.intent.intent?.toUpperCase(), C.cyan);
      statRow('Mismatch risk', intel.intent.mismatchRisk?.toUpperCase(), intel.intent.mismatchRisk === 'low' ? C.green : intel.intent.mismatchRisk === 'medium' ? C.yellow : C.red);
      (['informational', 'commercial', 'transactional', 'navigational'] as const).forEach((k) => {
        statRow(k.charAt(0).toUpperCase() + k.slice(1), String(intel.intent.scores?.[k] ?? 0), C.text2);
      });
    }

    y += 4;
    sectionHeader('AI Visibility');
    const aiVis = intel.aiVisibility;
    if (aiVis) {
      statRow('AI Visibility Score', `${aiVis.score}/100`, sc(aiVis.score));
      statRow('Answerability', String(aiVis.answerability), C.cyan);
      statRow('Entity Authority', String(aiVis.entityAuthority), C.cyan);
      statRow('Citation Readiness', String(aiVis.citationReadiness), C.cyan);
      statRow('LLM Accessibility', String(aiVis.llmAccessibility), C.cyan);
    }
  }

  y += 4;
  sectionHeader('Top Keywords');
  const kws = reportData.onPage?.keywords?.topKeywords ?? [];
  kws.slice(0, 15).forEach((kw: any) => {
    statRow(kw.word, `${kw.count}x · ${kw.density}%`, kw.density > 3 ? C.red : C.cyan);
  });

  // ═══════════════════════════════════════════════════════════
  //  PAGE 6 — AMP & Summary
  // ═══════════════════════════════════════════════════════════
  newPage();
  if (reportData.amp) {
    const amp = reportData.amp;
    sectionHeader('AMP Analysis', amp.score);
    checkRow('Has AMP version', amp.hasAmp ? 'Yes' : 'No', amp.hasAmp);
    checkRow('Is AMP page', amp.isAmpPage ? 'Yes' : 'No', amp.isAmpPage);
    checkRow('AMP URL', amp.ampUrl || 'None', !!amp.ampUrl);
    checkRow('AMP HTML tag', fmt(amp.ampHtmlTag), amp.ampHtmlTag);
    checkRow('AMP boilerplate', fmt(amp.ampBoilerplate), amp.ampBoilerplate);
    if (amp.recommendations?.length > 0) {
      y += 4;
      sectionHeader('AMP Recommendations', undefined);
      amp.recommendations.slice(0, 8).forEach((r: string) => issueRow(r, 'warn'));
    }
    y += 4;
  }

  // Final summary card
  sectionHeader('Report Summary');
  const summaryItems = [
    { label: 'Overall Score', value: `${reportData.overallScore}/100`, color: sc(reportData.overallScore) },
    { label: 'Grade', value: grade(reportData.overallScore), color: sc(reportData.overallScore) },
    { label: 'Total Issues', value: String(allIssues.length), color: allIssues.length === 0 ? C.green : C.yellow },
    { label: 'URL Analysed', value: reportData.url, color: C.cyan },
    { label: 'Report Generated', value: new Date(reportData.timestamp).toLocaleString(), color: C.text2 },
  ];
  summaryItems.forEach((s) => statRow(s.label, s.value, s.color));

  y += 8;
  // CTA banner
  doc.setFillColor(...C.surface);
  doc.roundedRect(MARGIN, y, COL, 22, 3, 3, 'F');
  doc.setDrawColor(...C.cyan);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, COL, 22, 3, 3, 'S');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.cyan);
  doc.text('◈  DEEPSEO', W / 2, y + 8, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.text2);
  doc.text('Complete SEO Analysis Suite  ·  Free & Open Source', W / 2, y + 14, { align: 'center' });

  return doc.output('blob');
}

// ─── main component ──────────────────────────────────────────────────────────

export default function DownloadReportModal({
  isOpen, onClose, reportUrl, overallScore, reportData, isDark,
}: DownloadReportModalProps) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<ModalStep>('email');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('email');
      setEmail('');
      setErrorMsg('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && step !== 'generating') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, onClose]);

  if (!isOpen) return null;

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  async function handleSubmit() {
    if (!isValidEmail(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setStep('generating');
    setErrorMsg('');

    try {
      // 1. Save email to Google Sheets (fire-and-forget, don't block PDF)
      fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          url: reportUrl,
          score: overallScore,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}); // silently ignore CORS no-cors errors

      // 2. Build the PDF
      const blob = await buildPDF(reportData);

      // 3. Trigger download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const hostname = new URL(reportUrl.startsWith('http') ? reportUrl : `https://${reportUrl}`).hostname.replace(/\./g, '_');
      link.download = `deepseo_report_${hostname}_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setStep('done');
    } catch (e) {
      console.error('PDF generation error:', e);
      setErrorMsg('Failed to generate PDF. Please try again.');
      setStep('error');
    }
  }

  // ── styles ──────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(5, 10, 20, 0.82)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
    animation: 'modalFadeIn 0.2s ease',
  };
  const modal: React.CSSProperties = {
    background: isDark ? '#0a1020' : '#f0f4fa',
    border: `1px solid ${isDark ? '#1e2d46' : '#c8d8ec'}`,
    borderRadius: 14,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 460,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    position: 'relative',
    animation: 'modalSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13px 14px',
    background: isDark ? '#0e1828' : '#e8f0f8',
    border: `1px solid ${isDark ? '#1e3050' : '#b8cce0'}`,
    borderRadius: 7,
    color: isDark ? '#e0ecff' : '#1a2a40',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '0.9rem',
    outline: 'none',
    marginBottom: 6,
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    width: '100%',
    padding: '13px',
    background: 'linear-gradient(135deg, #00d4ff 0%, #00f5a0 100%)',
    color: '#04101e',
    border: 'none',
    borderRadius: 7,
    fontFamily: 'IBM Plex Mono, monospace',
    fontWeight: 700,
    fontSize: '0.92rem',
    cursor: 'pointer',
    marginTop: 10,
    letterSpacing: '0.04em',
    transition: 'opacity 0.15s, transform 0.1s',
  };

  return (
    <>
      <style>{`
        @keyframes modalFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalSlideUp { from { opacity:0; transform:translateY(28px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .deepseo-email-input:focus { border-color: #00d4ff !important; box-shadow: 0 0 0 3px rgba(0,212,255,0.12) !important; }
        .deepseo-btn:hover:not(:disabled) { opacity:0.88; transform:translateY(-1px); }
        .deepseo-btn:active:not(:disabled) { transform:translateY(0); }
        .deepseo-close:hover { opacity:0.7; }
      `}</style>

      <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && step !== 'generating') onClose(); }}>
        <div style={modal}>

          {/* Close button */}
          {step !== 'generating' && (
            <button
              className="deepseo-close"
              onClick={onClose}
              style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#4a6488' : '#7090b0', fontSize: '1.2rem', lineHeight: 1, padding: '4px 8px' }}
            >✕</button>
          )}

          {/* ── step: email ── */}
          {step === 'email' && (
            <>
              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(0,245,160,0.1))', border: '1px solid rgba(0,212,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
                  📊
                </div>
                <div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '1rem', color: isDark ? '#e0ecff' : '#1a2a40', marginBottom: 3 }}>
                    Download PDF Report
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.68rem', color: isDark ? '#5a7a96' : '#7090b0' }}>
                    6-page full SEO analysis · Professional format
                  </div>
                </div>
              </div>

              {/* Score badge */}
              <div style={{ background: isDark ? '#0e1c30' : '#e0ecf8', border: `1px solid ${isDark ? '#1e3a55' : '#b8d0e8'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '2.2rem', lineHeight: 1, color: scoreColor(overallScore) }}>
                    {grade(overallScore)}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '1.2rem', color: isDark ? '#e0ecff' : '#1a2a40', lineHeight: 1 }}>
                    {overallScore}<span style={{ fontSize: '0.8rem', color: isDark ? '#4a6488' : '#7090b0', marginLeft: 2 }}>/100</span>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.65rem', color: isDark ? '#4a6488' : '#7090b0', marginTop: 3 }}>
                    {reportUrl.length > 38 ? reportUrl.slice(0, 38) + '…' : reportUrl}
                  </div>
                </div>
              </div>

              {/* Email input */}
              <label style={{ display: 'block', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', color: isDark ? '#4a6488' : '#7090b0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                Your Email Address
              </label>
              <input
                ref={inputRef}
                className="deepseo-email-input"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="you@example.com"
                style={inputStyle}
                autoComplete="email"
              />
              {errorMsg && (
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.7rem', color: '#ff4060', marginBottom: 2 }}>
                  ✗ {errorMsg}
                </div>
              )}
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.62rem', color: isDark ? '#3a5070' : '#90a8c0', marginBottom: 4 }}>
                Your email is saved securely. We'll never spam you.
              </div>

              <button className="deepseo-btn" style={btnPrimary} onClick={handleSubmit} disabled={!email.trim()}>
                ↓ Generate &amp; Download PDF
              </button>
            </>
          )}

          {/* ── step: generating ── */}
          {step === 'generating' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 56, height: 56, border: '4px solid rgba(0,212,255,0.15)', borderTopColor: '#00d4ff', borderRadius: '50%', animation: 'spin 0.9s linear infinite', margin: '0 auto 20px' }} />
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '1rem', color: isDark ? '#e0ecff' : '#1a2a40', marginBottom: 8 }}>
                Building your PDF…
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem', color: isDark ? '#4a6488' : '#7090b0', animation: 'pulse 1.5s ease-in-out infinite' }}>
                Compiling 6 pages of SEO data
              </div>
            </div>
          )}

          {/* ── step: done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: 14 }}>✅</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '1.05rem', color: '#00f5a0', marginBottom: 10 }}>
                Report Downloaded!
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.73rem', color: isDark ? '#5a7a96' : '#7090b0', marginBottom: 24, lineHeight: 1.6 }}>
                Your PDF has been saved to your downloads folder.<br />
                Check your browser's download bar.
              </div>
              <button
                className="deepseo-btn"
                style={{ ...btnPrimary, background: isDark ? '#0e1828' : '#dce8f4', color: isDark ? '#00d4ff' : '#006090', border: `1px solid ${isDark ? '#1e3050' : '#b0cce0'}` }}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          )}

          {/* ── step: error ── */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 14 }}>⚠️</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '1rem', color: '#ff4060', marginBottom: 10 }}>
                PDF Generation Failed
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem', color: isDark ? '#5a7a96' : '#7090b0', marginBottom: 20 }}>
                {errorMsg || 'An unexpected error occurred.'}
              </div>
              <button className="deepseo-btn" style={btnPrimary} onClick={() => setStep('email')}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
