(function (root) {
  'use strict';
  const REPORT_FONT_SIZE = 12;
  function render(pdf, sheet) {
    const width = pdf.internal?.pageSize.getWidth() || 215.9;
    const center = width / 2;
    const margin = 21;
    const bodyWidth = width - margin * 2;
    pdf.setTextColor(0); pdf.setDrawColor(0); pdf.setLineWidth(.2);
    pdf.setFont('times', 'bold'); pdf.setFontSize(REPORT_FONT_SIZE);
    pdf.text('APPROVAL SHEET', center, 14.5, { align: 'center' });
    const parts = [
      ['The undergraduate capstone project titled ', 'normal'],
      ['"' + sheet.title + '" ', 'bold'],
      ['prepared and submitted by ' + String(sheet.authors).replace(/;\s*/g, ', ').toUpperCase() + ', in partial fulfillment of the academic requirements for the degree ' + sheet.degree + ', is hereby approved and accepted.', 'normal'],
    ];
    let lines;
    const size = REPORT_FONT_SIZE;
    pdf.setFontSize(size);
    lines = [[]];
    let used = 0;
    for (const [text, style] of parts) {
      pdf.setFont('times', style);
      for (const word of text.trim().split(/\s+/)) {
        const wordWidth = pdf.getTextWidth(word);
        const gap = lines[lines.length - 1].length ? pdf.getTextWidth(' ') : 0;
        if (used + gap + wordWidth > bodyWidth && used) { lines.push([]); used = 0; }
        lines[lines.length - 1].push({ word, style, width: wordWidth });
        used += (used ? pdf.getTextWidth(' ') : 0) + wordWidth;
      }
    }
    if (lines.length > 15) throw new Error('The uploaded project details are too long for a one-page approval sheet.');
    let y = 24;
    const lineHeight = size * .46;
    for (const [index, words] of lines.entries()) {
      pdf.setFont('times', 'normal');
      const gap = pdf.getTextWidth(' ');
      let x = margin;
      for (const word of words) {
        pdf.setFont('times', word.style);
        pdf.text(word.word, x, y);
        x += word.width + gap;
      }
      y += lineHeight;
    }
    const adviser = Math.max(69, y + 12);
    function signer(person, x, top, columnWidth = bodyWidth, halfWidth = 17) {
      pdf.setFont('times', 'bold'); pdf.setFontSize(REPORT_FONT_SIZE);
      const nameLines = pdf.splitTextToSize(String(person?.name || '').toUpperCase(), columnWidth);
      if (nameLines.length) pdf.text(nameLines, x, top, { align: 'center', lineHeightFactor: 1.05 });
      pdf.setFont('times', 'normal'); pdf.setFontSize(REPORT_FONT_SIZE);
      const roleY = top + Math.max(1, nameLines.length) * 5.4;
      const roleLines = pdf.splitTextToSize(person?.role || '', columnWidth);
      pdf.text(roleLines, x, roleY, { align: 'center', lineHeightFactor: 1.05 });
      const dateY = Math.max(top + 21, roleY + Math.max(1, roleLines.length) * 5 + 3);
      pdf.line(x - halfWidth, dateY, x + halfWidth, dateY);
      pdf.text('Date Signed', x, dateY + 4.5, { align: 'center' });
      return dateY + 4.5;
    }
    const adviserBottom = signer(sheet.signers[0], center, adviser);
    const panelTop = Math.max(adviser + 39, adviserBottom + 12);
    const leftPanelX = width * .335;
    const rightPanelX = width * .65;
    const panelWidth = rightPanelX - leftPanelX - 8;
    const panelBottom = Math.max(
      signer(sheet.signers[1], leftPanelX, panelTop, panelWidth, 20),
      signer(sheet.signers[2], rightPanelX, panelTop, panelWidth, 20)
    );
    pdf.setFont('times', 'normal'); pdf.setFontSize(REPORT_FONT_SIZE);
    const acceptance = pdf.splitTextToSize('Accepted in partial fulfillment of the requirements for the degree ' + sheet.degree, 134);
    const acceptanceTop = Math.max(adviser + 79, panelBottom + 12);
    pdf.text(acceptance, center, acceptanceTop, { align: 'center', lineHeightFactor: 1.2 });
    const chairTop = Math.max(adviser + 102, acceptanceTop + acceptance.length * 4.3 + 12);
    const chairBottom = signer(sheet.signers[3], center, chairTop);
    const deanBottom = signer(sheet.signers[4], center, Math.max(adviser + 141, chairBottom + 12));
    if (deanBottom > (pdf.internal?.pageSize.getHeight() || 279.4) - 22) {
      throw new Error('The project details or signatory names are too long for a one-page approval sheet. Shorten the details and try again.');
    }
    pdf.setFont('times', 'normal'); pdf.setFontSize(7); pdf.setTextColor(100);
    pdf.text('i', width - 10, (pdf.internal?.pageSize.getHeight() || 279.4) - 15, { align: 'right' });
  }
  const api = { render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ApprovalSheetTemplate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
