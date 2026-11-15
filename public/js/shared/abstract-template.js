(function (root) {
  'use strict';

  const FONT_SIZE = 12;
  const LINE_HEIGHT = 4.233;
  const MARGIN = 25.4;
  const FIRST_LINE_INDENT = 12.7;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function styledLines(pdf, parts, width) {
    const lines = [[]];
    let used = 0;
    for (const part of parts) {
      pdf.setFont('times', part.style || 'normal');
      for (const word of clean(part.text).split(/\s+/).filter(Boolean)) {
        const wordWidth = pdf.getTextWidth(word);
        const gap = lines[lines.length - 1].length ? pdf.getTextWidth(' ') : 0;
        if (used && used + gap + wordWidth > width) {
          lines.push([]);
          used = 0;
        }
        lines[lines.length - 1].push({ word, style: part.style || 'normal', width: wordWidth });
        used += (used ? gap : 0) + wordWidth;
      }
    }
    return lines;
  }

  function drawStyledLines(pdf, lines, x, y) {
    for (const words of lines) {
      let cursor = x;
      for (const word of words) {
        pdf.setFont('times', word.style);
        pdf.text(word.word, cursor, y);
        cursor += word.width + pdf.getTextWidth(' ');
      }
      y += LINE_HEIGHT;
    }
    return y;
  }

  function wrapIndented(pdf, value, width) {
    const words = clean(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = [];
    let used = 0;
    let available = width - FIRST_LINE_INDENT;
    for (const word of words) {
      const wordWidth = pdf.getTextWidth(word);
      const gap = line.length ? pdf.getTextWidth(' ') : 0;
      if (line.length && used + gap + wordWidth > available) {
        lines.push(line.join(' '));
        line = [];
        used = 0;
        available = width;
      }
      line.push(word);
      used += (used ? gap : 0) + wordWidth;
    }
    if (line.length) lines.push(line.join(' '));
    return lines;
  }

  function render(pdf, report) {
    const pageWidth = pdf.internal?.pageSize.getWidth() || 215.9;
    const pageHeight = pdf.internal?.pageSize.getHeight() || 279.4;
    const contentWidth = pageWidth - MARGIN * 2;
    const center = pageWidth / 2;
    const authors = clean(report.authors).replace(/;\s*/g, ', ');
    const title = clean(report.title);
    const degree = clean(report.degree);
    const adviser = clean(report.adviser) || 'Unassigned';
    const abstract = clean(report.abstract) || 'No abstract provided.';
    const keywords = clean(report.keywords) || 'No keywords provided.';

    pdf.setTextColor(0);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(FONT_SIZE);
    pdf.text('ABSTRACT', center, 29.6, { align: 'center' });

    const citation = styledLines(pdf, [
      { text: `${authors}.`, style: 'normal' },
      { text: `"${title}",`, style: 'bold' },
      { text: `Undergraduate Capstone Project. ${degree}, Isabela State University, Cabagan, Isabela.`, style: 'normal' },
    ], contentWidth);
    let y = drawStyledLines(pdf, citation, MARGIN, 39.3);

    y += 5.7;
    pdf.setFont('times', 'normal');
    const adviserLabel = 'Capstone Project Adviser: ';
    pdf.text(adviserLabel, MARGIN, y);
    pdf.setFont('times', 'bold');
    pdf.text(adviser, MARGIN + pdf.getTextWidth(adviserLabel), y);

    y += 9.9;
    pdf.setFont('times', 'normal');
    const bodyLines = wrapIndented(pdf, abstract, contentWidth);
    bodyLines.forEach((line, index) => {
      const first = index === 0;
      const x = MARGIN + (first ? FIRST_LINE_INDENT : 0);
      const lineWidth = contentWidth - (first ? FIRST_LINE_INDENT : 0);
      const options = index < bodyLines.length - 1 ? { align: 'justify', maxWidth: lineWidth } : {};
      pdf.text(line, x, y, options);
      y += LINE_HEIGHT;
    });

    y += 4.2;
    const keywordLines = styledLines(pdf, [
      { text: 'Keywords:', style: 'bolditalic' },
      { text: keywords, style: 'italic' },
    ], contentWidth);
    if (y + keywordLines.length * LINE_HEIGHT > pageHeight - MARGIN) {
      throw new Error('The abstract is too long to fit the required one-page, 12-point format.');
    }
    drawStyledLines(pdf, keywordLines, MARGIN, y);
  }

  const api = { render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AbstractReportTemplate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
