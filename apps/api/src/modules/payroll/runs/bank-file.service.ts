import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankFileRun, BankFileFormat, BankFileStatus } from './entities/bank-file-run.entity';
import { PayrollRun, PayrollRunStatus } from './entities/payroll-run.entity';
import { Payslip, PayslipStatus } from './entities/payslip.entity';

export interface BankFileOptions {
  /** Company/employer name for NACHA/SEPA header */
  companyName?: string;
  /** ODFI routing number for NACHA (9 digits) */
  odfiRoutingNumber?: string;
  /** Company tax ID for NACHA (10 chars) */
  companyIdentification?: string;
  /** MOL employer ID for WPS */
  molEmployerId?: string;
  /** Creditor IBAN for SEPA */
  creditorIban?: string;
  /** Reference date override (YYYY-MM-DD) */
  paymentDate?: string;
}

const pad   = (s: string | number, n: number, c = ' ', right = false) =>
  right
    ? String(s).slice(0, n).padEnd(n, c)
    : String(s).slice(0, n).padStart(n, c);

const padL  = (s: string | number, n: number, c = ' ') => pad(s, n, c, true);
const padR  = (s: string | number, n: number, c = '0') => pad(s, n, c, false);
const cents = (amount: number) => Math.round(Number(amount) * 100);

@Injectable()
export class BankFileService {
  constructor(
    @InjectRepository(BankFileRun)
    private readonly fileRunRepo: Repository<BankFileRun>,
    @InjectRepository(PayrollRun)
    private readonly runRepo: Repository<PayrollRun>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async listBankFileRuns(tenantId: string, payrollRunId: string): Promise<BankFileRun[]> {
    return this.fileRunRepo.find({
      where: { tenantId, payrollRunId },
      order: { generatedAt: 'DESC' },
    });
  }

  async generateAndSave(
    tenantId: string,
    payrollRunId: string,
    format: BankFileFormat,
    options: BankFileOptions = {},
    userId?: string,
  ): Promise<BankFileRun> {
    const run = await this.runRepo.findOne({ where: { id: payrollRunId, tenantId } });
    if (!run) throw new NotFoundException(`Payroll run ${payrollRunId} not found`);
    if (![PayrollRunStatus.APPROVED, PayrollRunStatus.PAID].includes(run.status)) {
      throw new BadRequestException('Bank file can only be generated for APPROVED or PAID runs');
    }

    const payslips = await this.payslipRepo.find({ where: { tenantId, payrollRunId } });
    if (!payslips.length) throw new BadRequestException('No payslips found for this run');

    // Supersede existing GENERATED files for the same run + format
    const existing = await this.fileRunRepo.find({
      where: { tenantId, payrollRunId, format, status: BankFileStatus.GENERATED },
    });
    for (const old of existing) {
      old.status = BankFileStatus.SUPERSEDED;
      await this.fileRunRepo.save(old);
    }

    const content = this.generateContent(format, run, payslips, options);
    const totalAmount = payslips.reduce((s, p) => s + Number(p.netPay), 0);

    const fileRun = this.fileRunRepo.create({
      tenantId,
      payrollRunId,
      format,
      employeeCount: payslips.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      content,
      generatedBy: userId ?? null,
    } as any);
    return (this.fileRunRepo.save(fileRun) as unknown) as Promise<BankFileRun>;
  }

  async markPayslipsPaid(tenantId: string, payrollRunId: string): Promise<{ updated: number }> {
    const payslips = await this.payslipRepo.find({ where: { tenantId, payrollRunId } });
    let updated = 0;
    for (const p of payslips) {
      if (p.status !== PayslipStatus.PAID) {
        p.status = PayslipStatus.PAID;
        await this.payslipRepo.save(p);
        updated++;
      }
    }
    return { updated };
  }

  // ─── Format dispatch ──────────────────────────────────────────────────────

  generateContent(
    format: BankFileFormat,
    run: PayrollRun,
    payslips: Payslip[],
    opts: BankFileOptions,
  ): string {
    switch (format) {
      case BankFileFormat.NEFT_RTGS: return this.buildNeftRtgs(run, payslips, opts);
      case BankFileFormat.NACHA_ACH:  return this.buildNachaAch(run, payslips, opts);
      case BankFileFormat.WPS_SIF:    return this.buildWpsSif(run, payslips, opts);
      case BankFileFormat.SEPA_XML:   return this.buildSepaXml(run, payslips, opts);
    }
  }

  // ─── NEFT/RTGS (India) ───────────────────────────────────────────────────

  buildNeftRtgs(run: PayrollRun, payslips: Payslip[], opts: BankFileOptions): string {
    const payDate = opts.paymentDate ?? run.payDate ?? new Date().toISOString().slice(0, 10);
    const dt = payDate.replace(/-/g, '');
    const currency = run.currency ?? 'INR';
    const company = (opts.companyName ?? 'EMPLOYER').slice(0, 35);
    const totalNet = payslips.reduce((s, p) => s + Number(p.netPay), 0);

    const lines: string[] = [];
    // Header record
    lines.push(`H|${dt}|${company}|${String(payslips.length).padStart(6, '0')}|${currency}`);

    // Detail records
    payslips.forEach((p, i) => {
      const seq   = String(i + 1).padStart(6, '0');
      const name  = (p.employeeName ?? p.employeeCode ?? '').replace(/,/g, ' ').slice(0, 35);
      const empId = p.employeeCode ?? p.employeeId.slice(0, 20);
      const net   = Number(p.netPay).toFixed(2);
      // Placeholder bank details — real integration would pull from employee master
      lines.push(`D|${seq}|${empId}|${name}|||${net}|${currency}|SALARY ${run.name?.slice(0, 20) ?? ''}`);
    });

    // Trailer record
    lines.push(`T|${payslips.length}|${totalNet.toFixed(2)}|${currency}`);
    return lines.join('\r\n');
  }

  // ─── NACHA ACH (US) ─────────────────────────────────────────────────────

  buildNachaAch(run: PayrollRun, payslips: Payslip[], opts: BankFileOptions): string {
    const payDate     = opts.paymentDate ?? run.payDate ?? new Date().toISOString().slice(0, 10);
    const effDate     = payDate.replace(/-/g, '').slice(2); // YYMMDD
    const now         = new Date();
    const fileDate    = now.toISOString().replace(/-/g, '').slice(2, 8);
    const fileTime    = now.toISOString().replace(/T/, '').replace(/:/g, '').slice(8, 12);
    const odfi9       = (opts.odfiRoutingNumber ?? '000000000').slice(0, 9);
    const odfi        = odfi9.slice(0, 8);
    const companyId   = padL(opts.companyIdentification ?? '0000000000', 10);
    const companyName = padL(opts.companyName ?? 'PAYROLL CO', 16);
    const batchNum    = '0000001';

    const records: string[] = [];

    // 1 — File Header (94 chars)
    records.push(
      '1' +
      '01' +
      ` ${odfi9}` +
      padL(odfi, 10) +
      fileDate +
      fileTime +
      'A' +
      '094' +
      '10' +
      '1' +
      padL(opts.companyName ?? 'BANK', 23) +
      padL(opts.companyName ?? 'COMPANY', 23) +
      '        ',
    );

    // 5 — Company/Batch Header (94 chars)
    records.push(
      '5' +
      '220' +
      companyName +
      padL('', 20) +
      companyId +
      'PPD' +
      padL('PAYROLL', 10) +
      '      ' +
      effDate +
      '   ' +
      '1' +
      odfi +
      batchNum,
    );

    // 6 — Entry Detail Records
    let entryHash = BigInt(0);
    let totalCreditCents = BigInt(0);
    payslips.forEach((p, i) => {
      const routing = '000000000'; // placeholder routing — real use would come from employee bank record
      entryHash += BigInt(routing.slice(0, 8));
      const amountCents = BigInt(cents(Number(p.netPay)));
      totalCreditCents += amountCents;
      const name = padL((p.employeeName ?? p.employeeCode ?? 'EMPLOYEE').slice(0, 22), 22);
      const acctNo = padL(p.employeeCode ?? p.employeeId.slice(0, 17), 17);
      const traceNo = odfi + String(i + 1).padStart(7, '0');
      records.push(
        '6' +
        '22' +
        routing +
        acctNo +
        padR(String(amountCents), 10) +
        padL(p.employeeCode ?? '', 15) +
        name +
        '  ' +
        '0' +
        traceNo,
      );
    });

    const entryCount = payslips.length;
    const entryHashMod = padR(String(entryHash % BigInt(10_000_000_000)), 10);
    const creditStr = padR(String(totalCreditCents), 12);

    // 8 — Batch Control (94 chars)
    records.push(
      '8' +
      '220' +
      padR(String(entryCount), 6) +
      entryHashMod +
      padR('0', 12) +
      creditStr +
      companyId +
      padL('', 25) +
      odfi +
      batchNum,
    );

    // 9 — File Control (94 chars)
    const batchCount = 1;
    const totalRecords = records.length + 1; // + file control
    const blockCount = Math.ceil((totalRecords + 1) / 10); // +1 for file control itself
    records.push(
      '9' +
      padR(String(batchCount), 6) +
      padR(String(blockCount), 6) +
      padR(String(entryCount), 8) +
      entryHashMod +
      padR('0', 12) +
      creditStr +
      padL('', 39),
    );

    // Pad to multiple of 10 lines with all-9 records
    const totalLines = records.length;
    const paddingNeeded = (10 - (totalLines % 10)) % 10;
    for (let i = 0; i < paddingNeeded; i++) {
      records.push('9'.repeat(94));
    }

    return records.join('\r\n');
  }

  // ─── WPS SIF (UAE) ───────────────────────────────────────────────────────

  buildWpsSif(run: PayrollRun, payslips: Payslip[], opts: BankFileOptions): string {
    const year  = run.payPeriodYear ?? new Date().getFullYear();
    const month = String(run.payPeriodMonth ?? new Date().getMonth() + 1).padStart(2, '0');
    const currency = run.currency ?? 'AED';
    const molId = opts.molEmployerId ?? '0000000000';
    const totalNet = payslips.reduce((s, p) => s + Number(p.netPay), 0);

    const lines: string[] = [];

    // EDR — Employer Detail Record
    lines.push([
      'EDR',
      molId,
      year,
      month,
      currency,
      totalNet.toFixed(2),
      String(payslips.length),
    ].join('|'));

    // EER — Employee Entry Records
    for (const p of payslips) {
      const earnings = (p.earnings as any[]) ?? [];
      const basic = earnings.find((e: any) => e.code === 'BASIC')?.amount ?? Number(p.grossEarnings ?? 0);
      const house = earnings.find((e: any) => e.code === 'HRA' || e.code === 'HOUSE_RENT')?.amount ?? 0;
      const transport = earnings.find((e: any) => e.code === 'TRANSPORT' || e.code === 'TRANSPORT_ALLOWANCE')?.amount ?? 0;
      const daysWorked = Number(p.daysWorked ?? 30);
      lines.push([
        'EER',
        p.employeeCode ?? p.employeeId.slice(0, 20),
        '',           // routing code (bank-specific)
        '',           // agent ID
        '',           // account number
        `${year}-${month}-01`, // employment period start
        year,
        month,
        daysWorked.toFixed(2),
        Number(basic).toFixed(2),
        '0.00',       // variable pay
        Number(house + transport).toFixed(2),
        Number(p.totalDeductions ?? 0).toFixed(2),
        Number(p.netPay).toFixed(2),
        currency,
        Number(house).toFixed(2),
        Number(transport).toFixed(2),
        '0.00',       // other allowances
        '0.00',       // overtime
        '0.00',       // commission
        '0.00',       // bonus
      ].join('|'));
    }

    return lines.join('\r\n');
  }

  // ─── SEPA XML (EU/UK) — pain.001.001.03 ─────────────────────────────────

  buildSepaXml(run: PayrollRun, payslips: Payslip[], opts: BankFileOptions): string {
    const payDate  = opts.paymentDate ?? run.payDate ?? new Date().toISOString().slice(0, 10);
    const currency = run.currency ?? 'EUR';
    const creditor = opts.creditorIban ?? 'GB00XXXX00000000000000';
    const company  = (opts.companyName ?? 'EMPLOYER LTD').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const msgId    = `PAYROLL-${run.id?.slice(0, 8) ?? '00000000'}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const totalNet = payslips.reduce((s, p) => s + Number(p.netPay), 0);

    const txns = payslips.map((p, i) => {
      const name = (p.employeeName ?? p.employeeCode ?? 'EMPLOYEE').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const endToEnd = `PAYROLL-${p.employeeCode ?? p.employeeId.slice(0, 8)}-${String(i + 1).padStart(4, '0')}`;
      return `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${endToEnd}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${currency}">${Number(p.netPay).toFixed(2)}</InstdAmt></Amt>
      <Cdtr><Nm>${name}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${creditor}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>SALARY ${run.payPeriodYear}/${String(run.payPeriodMonth).padStart(2, '0')}</Ustrd></RmtInf>
    </CdtTrfTxInf>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${new Date().toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${payslips.length}</NbOfTxs>
      <CtrlSum>${totalNet.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${company}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-001</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${payslips.length}</NbOfTxs>
      <CtrlSum>${totalNet.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${payDate}</ReqdExctnDt>
      <Dbtr><Nm>${company}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${creditor}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>XXXXXXXX</BIC></FinInstnId></DbtrAgt>${txns}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
  }
}
