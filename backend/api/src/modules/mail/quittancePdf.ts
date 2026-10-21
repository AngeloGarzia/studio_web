import PDFDocument from "pdfkit";
import { eurosToLetters, formatEuro } from "../../shared/eurosFr.js";

export type QuittancePdfInput = {
  bailleurName: string;
  bailleurAddress: string;
  bailleurPhone: string;
  bailleurEmail: string;
  tenantName: string;
  tenantAddress?: string;
  logement: string;
  periodFrom: string;
  periodTo: string;
  rentCents: number;
  chargesCents: number;
  receivedCents: number;
  paymentDate: string;
  paymentMethod: string;
  place: string;
  issueDate: string;
  feeLines: Array<{ label: string; priceCents: number }>;
  signatures?: QuittanceSignature[];
  occupants?: Array<{ name: string; email?: string; phone?: string; address?: string }>;
  /** Capture du site de la plateforme, jointe au détail du paiement. */
  platformProof?: { platform: string; image: Buffer };
  /** Nom de la plateforme de réservation, s’il y en a une. */
  platform?: string;
  /** Meublé de tourisme : pas de mention de l’article 21. */
  furnishedTourism?: boolean;
};

export function joinTenantNames(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

export type QuittanceSignature = {
  png?: Uint8Array | null;
  caption: string;
  role: string;
};

export function signatureOfOwner(owner: {
  firstName: string;
  lastName: string;
  isCompany: boolean;
  signaturePng?: Uint8Array | null;
}): QuittanceSignature {
  return {
    png: owner.signaturePng && owner.signaturePng.byteLength > 0 ? owner.signaturePng : null,
    caption: `${owner.firstName} ${owner.lastName}`.trim(),
    role: owner.isCompany ? "Mandataire" : "Propriétaire"
  };
}

const ink = "#0f172a";
const muted = "#475569";
const water = "#0e7490";
const waterDeep = "#155e75";
const waterSoft = "#ecfeff";
const waterLine = "#a5f3fc";
const sun = "#ffd166";
const sunSoft = "#fff8e8";
const white = "#ffffff";
const roseSoft = "#fff1f2";
const roseInk = "#9f1239";

function slashDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!match) return ymd;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function euro(cents: number): string {
  return `${formatEuro(cents).replace(/\u202f|\u00a0/g, " ")} EUR`;
}

/** Quittance ou reçu A4, aux couleurs de l'application, dates en jj/mm/aaaa. */
export function renderQuittancePdf(input: QuittancePdfInput): Promise<Buffer> {
  const dueCents = input.rentCents + input.chargesCents;
  const platform = input.platform?.trim() || input.platformProof?.platform?.trim() || "";
  const paidInFull = input.receivedCents >= dueCents && dueCents > 0;
  const quittance = Boolean(platform) || paidInFull;
  const title = quittance ? "Quittance de loyer" : "Reçu de loyer";
  const feesSum = input.feeLines.reduce((sum, fee) => sum + fee.priceCents, 0);
  const showFees = input.feeLines.length > 0 && feesSum === input.chargesCents;
  const amountWords = `${eurosToLetters(input.receivedCents)} (${euro(input.receivedCents)})`;
  const declaredTenants =
    input.occupants && input.occupants.length > 0 ? joinTenantNames(input.occupants.map((person) => person.name)) : input.tenantName;
  const declaration = platform
    ? `Je soussigné(e) ${input.bailleurName}, bailleur du logement désigné ci-dessus, déclare avoir loué le logement ci-dessus dans la période mentionnée ci-dessus, selon les modalités de la plateforme ${platform}.`
    : paidInFull
      ? `Le bailleur ${input.bailleurName} déclare avoir reçu de ${declaredTenants} la somme de ${amountWords} au titre du loyer et des charges pour la période indiquée, et lui en donne quittance, sous réserve de tous ses droits.`
      : `Le bailleur ${input.bailleurName} déclare avoir reçu de ${declaredTenants} la somme de ${amountWords} à valoir sur le loyer et les charges de la période indiquée.`;
  const reserve = quittance
    ? "Cette quittance ne présume pas du paiement des termes antérieurs."
    : "Le présent document est un reçu, et non une quittance : le loyer et les charges de la période ne sont pas intégralement payés.";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const width = pageWidth - margin * 2;
    const gap = 14;
    const colWidth = (width - gap) / 2;

    doc.rect(0, 0, pageWidth, 96).fill(water);
    doc.rect(0, 96, pageWidth, 6).fill(sun);
    doc.fillColor(white).font("Helvetica-Bold").fontSize(22).text(title.toUpperCase(), margin, 28, { width, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor("#cffafe").text("Location  ·  article 21 de la loi n. 89-462 du 6 juillet 1989", margin, 60, {
      width,
      align: "center"
    });

    type TextLine = { text: string; strong: boolean };
    const textLines = (values: Array<string | undefined>): TextLine[] =>
      values.filter((value): value is string => Boolean(value?.trim())).map((text, index) => ({ text, strong: index === 0 }));
    const bailleurLines = textLines([input.bailleurName, input.bailleurAddress, input.bailleurPhone, input.bailleurEmail]);
    const occupantPeople = (input.occupants ?? []).filter((person) => person.name.trim());
    const tenantLines: TextLine[] = occupantPeople.length
      ? occupantPeople.flatMap((person) =>
          textLines([person.name, person.address, person.email, person.phone]).map((line, index) => ({ ...line, strong: index === 0 }))
        )
      : textLines([input.tenantName, input.tenantAddress]);
    const tenantHeading = occupantPeople.length > 1 ? "Locataires" : "Locataire";
    const partyHeight = (lines: TextLine[]) => {
      doc.font("Helvetica").fontSize(11);
      return lines.reduce((sum, line) => sum + doc.heightOfString(line.text, { width: colWidth - 28 }), 0);
    };
    const cardHeight = Math.max(88, 36 + Math.max(partyHeight(bailleurLines), partyHeight(tenantLines)));

    const drawParty = (x: number, y: number, label: string, lines: TextLine[]) => {
      doc.roundedRect(x, y, colWidth, cardHeight, 10).fillAndStroke(waterSoft, waterLine);
      doc.fillColor(water).font("Helvetica-Bold").fontSize(9).text(label.toUpperCase(), x + 14, y + 12, { width: colWidth - 28 });
      let lineY = y + 30;
      for (const line of lines) {
        doc.fillColor(line.strong ? ink : muted).font(line.strong ? "Helvetica-Bold" : "Helvetica").fontSize(11);
        doc.text(line.text, x + 14, lineY, { width: colWidth - 28 });
        lineY = doc.y + 2;
      }
    };

    const proof = input.platformProof;
    const withProof = Boolean(proof?.image && proof.image.byteLength > 8);
    const rows: Array<{ label: string; cents: number; kind: "plain" | "fee" | "total" | "received" | "balance" }> = [];
    if (!withProof) {
      rows.push(
        { label: "Loyer hors charges", cents: input.rentCents, kind: "plain" },
        { label: "Provisions pour charges", cents: input.chargesCents, kind: "plain" }
      );
      if (showFees) {
        for (const fee of input.feeLines) rows.push({ label: `dont ${fee.label}`, cents: fee.priceCents, kind: "fee" });
      }
      rows.push({ label: "Total dû", cents: dueCents, kind: "total" });
      rows.push({ label: "Somme reçue", cents: input.receivedCents, kind: "received" });
      if (!paidInFull) rows.push({ label: "Solde restant dû", cents: Math.max(0, dueCents - input.receivedCents), kind: "balance" });
    }

    doc.font("Helvetica").fontSize(11);
    const logementHeight = doc.heightOfString(input.logement, { width: width - 114 });
    const infoHeight = 16 + logementHeight + 8 + 16 + 12;
    const rowHeight = 28;
    const proofImageHeight = withProof ? 220 : 0;
    const tableHeight = withProof ? 16 + proofImageHeight + 16 : 32 + rows.length * rowHeight;
    const legalHeight = 28 + doc.heightOfString(declaration, { width: width - 36 }) + 8 + doc.heightOfString(reserve, { width: width - 36 });
    const signatures = (input.signatures ?? []).filter((item) => item.caption || item.png);
    const closingHeight = signatures.length > 0 ? 132 : 48;
    const footerTop = pageHeight - 42;
    const blockHeights = cardHeight + infoHeight + tableHeight + legalHeight + closingHeight;
    const sectionGap = Math.max(12, (footerTop - 122 - 16 - blockHeights) / 4);

    let y = 122;
    drawParty(margin, y, "Bailleur", bailleurLines);
    drawParty(margin + colWidth + gap, y, tenantHeading, tenantLines);
    y += cardHeight + sectionGap;

    doc.roundedRect(margin, y, width, infoHeight, 10).fillAndStroke(white, waterLine);
    doc.fillColor(water).font("Helvetica-Bold").fontSize(9).text("LOGEMENT", margin + 14, y + 14, { width: 78 });
    doc.fillColor(ink).font("Helvetica").fontSize(11).text(input.logement, margin + 96, y + 12, { width: width - 114 });
    const periodY = y + 12 + logementHeight + 8;
    doc.fillColor(water).font("Helvetica-Bold").fontSize(9).text("PÉRIODE", margin + 14, periodY + 2, { width: 78 });
    doc.fillColor(ink).font("Helvetica").fontSize(11).text(`Du ${slashDate(input.periodFrom)} au ${slashDate(input.periodTo)}`, margin + 96, periodY, {
      width: width - 114
    });
    y += infoHeight + sectionGap;

    if (withProof && proof) {
      doc.roundedRect(margin, y, width, tableHeight, 10).fillAndStroke(white, waterLine);
      try {
        doc.image(proof.image, margin + 12, y + 12, { fit: [width - 24, proofImageHeight], align: "center", valign: "center" });
      } catch {
        doc.fillColor(muted).font("Helvetica").fontSize(10).text("La capture n’a pas pu être affichée.", margin + 14, y + 16, { width: width - 28 });
      }
    } else {
      doc.save();
      doc.roundedRect(margin, y, width, tableHeight, 10).clip();
      doc.rect(margin, y, width, 32).fill(water);
      doc.fillColor(white).font("Helvetica-Bold").fontSize(10).text("DÉTAIL", margin + 14, y + 10, { width: width - 150 });
      doc.text("MONTANT", margin + width - 130, y + 10, { width: 116, align: "right" });
      rows.forEach((row, index) => {
        const rowY = y + 32 + index * rowHeight;
        const fill = row.kind === "received" ? sunSoft : row.kind === "total" ? waterSoft : row.kind === "balance" ? roseSoft : index % 2 === 0 ? "#f8fafc" : white;
        doc.rect(margin, rowY, width, rowHeight).fill(fill);
        const color = row.kind === "balance" ? roseInk : ink;
        doc.fillColor(color).font(row.kind === "fee" ? "Helvetica-Oblique" : row.kind === "plain" ? "Helvetica" : "Helvetica-Bold").fontSize(11);
        doc.text(row.label, margin + 14, rowY + 8, { width: width - 160, lineBreak: false });
        doc.text(euro(row.cents), margin + width - 130, rowY + 8, { width: 116, align: "right", lineBreak: false });
      });
      doc.restore();
      doc.lineWidth(1).strokeColor(waterLine).roundedRect(margin, y, width, tableHeight, 10).stroke();
    }
    y += tableHeight + sectionGap;

    doc.roundedRect(margin, y, width, legalHeight, 10).fill(waterSoft);
    doc.rect(margin, y, 5, legalHeight).fill(water);
    doc.fillColor(ink).font("Helvetica").fontSize(11).text(declaration, margin + 18, y + 12, { width: width - 36, align: "justify" });
    doc.fillColor(muted).fontSize(10).text(reserve, margin + 18, doc.y + 8, { width: width - 36, align: "justify" });
    y += legalHeight + sectionGap;

    const closingY = y;
    doc.fillColor(ink).font("Helvetica").fontSize(11).text(
      platform
        ? `Paiement reçu selon les modalités de la plateforme ${platform}.`
        : `Paiement reçu le ${slashDate(input.paymentDate)} par ${input.paymentMethod.toLocaleLowerCase("fr-FR")}.`,
      margin,
      closingY,
      { width }
    );
    doc.fillColor(waterDeep).font("Helvetica-Bold").fontSize(12).text(`Fait à ${input.place}, le ${slashDate(input.issueDate)}.`, margin, closingY + 28, {
      width,
      align: "right"
    });
    if (signatures.length > 0) {
      const boxGap = 12;
      const boxWidth = Math.min(168, (width - boxGap * (signatures.length - 1)) / signatures.length);
      const rowWidth = signatures.length * boxWidth + (signatures.length - 1) * boxGap;
      let signX = margin + width - rowWidth;
      const imageTop = closingY + 52;
      for (const signature of signatures) {
        const png = signature.png && signature.png.byteLength > 8 ? Buffer.from(signature.png) : null;
        if (png) {
          try {
            doc.image(png, signX + 6, imageTop, { fit: [boxWidth - 12, 42], align: "center", valign: "bottom" });
          } catch {
            doc.strokeColor("#94a3b8").lineWidth(0.8).moveTo(signX + 10, imageTop + 36).lineTo(signX + boxWidth - 10, imageTop + 36).stroke();
          }
        } else {
          doc.strokeColor("#94a3b8").lineWidth(0.8).moveTo(signX + 10, imageTop + 36).lineTo(signX + boxWidth - 10, imageTop + 36).stroke();
        }
        doc.fillColor(ink).font("Helvetica-Bold").fontSize(9).text(signature.caption || signature.role, signX, imageTop + 46, {
          width: boxWidth,
          align: "center",
          lineBreak: false
        });
        doc.fillColor(muted).font("Helvetica").fontSize(8).text(signature.role, signX, imageTop + 58, {
          width: boxWidth,
          align: "center",
          lineBreak: false
        });
        signX += boxWidth + boxGap;
      }
    }

    doc.rect(0, footerTop, pageWidth, 42).fill(waterDeep);
    doc.rect(0, footerTop, pageWidth, 4).fill(sun);
    if (!input.furnishedTourism) {
      doc.fillColor("#cffafe").font("Helvetica").fontSize(8).text(
        "Document remis gratuitement, conformément à l'article 21 de la loi n. 89-462.",
        margin,
        footerTop + 16,
        { width, align: "center" }
      );
    }

    doc.end();
  });
}
