import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmtpConfig } from './entities/smtp-config.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailLog, EmailStatus } from './entities/email-log.entity';

interface TemplateDefinition {
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<string, TemplateDefinition> = {
  LEAVE_APPROVED: {
    subject: 'Your leave request has been approved',
    body:
      'Hello {{employeeName}},\n\nYour leave request from {{fromDate}} to {{toDate}} ({{days}} day(s)) has been approved.\n\nRegards,\n{{companyName}}',
  },
  LEAVE_REJECTED: {
    subject: 'Your leave request has been rejected',
    body:
      'Hello {{employeeName}},\n\nYour leave request from {{fromDate}} to {{toDate}} ({{days}} day(s)) has been rejected.\nRemarks: {{remarks}}\n\nRegards,\n{{companyName}}',
  },
  PAYSLIP_READY: {
    subject: 'Your payslip is ready',
    body:
      'Hello {{employeeName}},\n\nYour payslip for {{period}} is now available. Net pay: {{netPay}}.\n\nRegards,\n{{companyName}}',
  },
  PO_APPROVED: {
    subject: 'Purchase order {{poNumber}} approved',
    body:
      'Hello {{vendorName}},\n\nPurchase order {{poNumber}} has been approved. Total: {{total}}.\n\nRegards,\n{{companyName}}',
  },
  USER_INVITE: {
    subject: 'You have been invited to {{companyName}}',
    body:
      'Hello,\n\nYou have been invited to join {{companyName}}. Use the following link to set up your account: {{inviteLink}}\n\nRegards,\n{{companyName}}',
  },
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(SmtpConfig)
    private readonly smtpRepo: Repository<SmtpConfig>,
    @InjectRepository(EmailTemplate)
    private readonly templateRepo: Repository<EmailTemplate>,
    @InjectRepository(EmailLog)
    private readonly logRepo: Repository<EmailLog>,
  ) {}

  renderTemplate(str: string, vars: Record<string, any> = {}): string {
    return (str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
      const v = vars[key];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  // ---- SMTP config ----
  async getSmtpConfig(tenantId: string): Promise<SmtpConfig | null> {
    return this.smtpRepo.findOne({ where: { tenantId } });
  }

  async saveSmtpConfig(tenantId: string, dto: Partial<SmtpConfig>): Promise<SmtpConfig> {
    let config = await this.smtpRepo.findOne({ where: { tenantId } });
    if (!config) {
      config = this.smtpRepo.create({ tenantId });
    }
    Object.assign(config, {
      host: dto.host ?? config.host,
      port: dto.port ?? config.port ?? 587,
      username: dto.username ?? config.username,
      password: dto.password ?? config.password,
      fromEmail: dto.fromEmail ?? config.fromEmail,
      fromName: dto.fromName ?? config.fromName,
      isActive: dto.isActive ?? config.isActive ?? true,
    });
    return this.smtpRepo.save(config);
  }

  // ---- Templates ----
  async listTemplates(tenantId: string): Promise<any[]> {
    const stored = await this.templateRepo.find({ where: { tenantId } });
    const storedByCode = new Map(stored.map((t) => [t.code, t]));
    const result: any[] = [];
    for (const [code, def] of Object.entries(DEFAULT_TEMPLATES)) {
      const existing = storedByCode.get(code);
      if (existing) {
        result.push(existing);
      } else {
        result.push({
          id: null,
          tenantId,
          code,
          subject: def.subject,
          body: def.body,
          isActive: true,
          isDefault: true,
        });
      }
    }
    // include any custom templates not in defaults
    for (const t of stored) {
      if (!DEFAULT_TEMPLATES[t.code]) result.push(t);
    }
    return result;
  }

  async saveTemplate(tenantId: string, dto: Partial<EmailTemplate>): Promise<EmailTemplate> {
    let template: EmailTemplate | null = null;
    if (dto.id) {
      template = await this.templateRepo.findOne({ where: { id: dto.id, tenantId } });
    }
    if (!template && dto.code) {
      template = await this.templateRepo.findOne({ where: { tenantId, code: dto.code } });
    }
    if (!template) {
      template = this.templateRepo.create({ tenantId, code: dto.code });
    }
    Object.assign(template, {
      code: dto.code ?? template.code,
      subject: dto.subject ?? template.subject,
      body: dto.body ?? template.body,
      isActive: dto.isActive ?? template.isActive ?? true,
    });
    return this.templateRepo.save(template);
  }

  private async resolveTemplate(
    tenantId: string,
    code: string,
  ): Promise<TemplateDefinition> {
    const stored = await this.templateRepo.findOne({ where: { tenantId, code, isActive: true } });
    if (stored) return { subject: stored.subject, body: stored.body };
    const def = DEFAULT_TEMPLATES[code];
    if (def) return def;
    return { subject: code, body: '' };
  }

  // ---- Logs ----
  async getLogs(tenantId: string, limit = 100): Promise<EmailLog[]> {
    return this.logRepo.find({
      where: { tenantId },
      order: { sentAt: 'DESC' },
      take: limit,
    });
  }

  private async buildTransport(
    tenantId: string,
  ): Promise<{ transporter: any; fromEmail: string; fromName?: string } | null> {
    const nodemailer = await import('nodemailer');
    const config = await this.smtpRepo.findOne({ where: { tenantId } });

    let host: string | undefined;
    let port: number | undefined;
    let user: string | undefined;
    let pass: string | undefined;
    let fromEmail: string | undefined;
    let fromName: string | undefined;

    if (config && config.isActive) {
      host = config.host;
      port = config.port;
      user = config.username;
      pass = config.password;
      fromEmail = config.fromEmail;
      fromName = config.fromName;
    }

    host = host || process.env.SMTP_HOST;
    port = port || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined);
    user = user || process.env.SMTP_USER;
    pass = pass || process.env.SMTP_PASS;
    fromEmail = fromEmail || process.env.SMTP_FROM;

    if (!host || !fromEmail) return null;

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: (port || 587) === 465,
      auth: user ? { user, pass } : undefined,
    });
    return { transporter, fromEmail, fromName };
  }

  /** Send an email. NEVER throws — logs the result and returns status. */
  async sendEmail(
    tenantId: string,
    to: string,
    code: string,
    vars: Record<string, any> = {},
  ): Promise<{ status: EmailStatus; error?: string }> {
    const template = await this.resolveTemplate(tenantId, code);
    const subject = this.renderTemplate(template.subject, vars);
    const body = this.renderTemplate(template.body, vars);

    try {
      const transport = await this.buildTransport(tenantId);
      if (!transport) {
        throw new Error('No active SMTP configuration found (DB or environment)');
      }
      const from = transport.fromName
        ? `"${transport.fromName}" <${transport.fromEmail}>`
        : transport.fromEmail;
      await transport.transporter.sendMail({
        from,
        to,
        subject,
        text: body,
      });
      await this.logRepo.save(
        this.logRepo.create({
          tenantId,
          templateCode: code,
          toEmail: to,
          subject,
          status: EmailStatus.SENT,
          errorMessage: null,
        }),
      );
      return { status: EmailStatus.SENT };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      this.logger.warn(`Email send failed (${code} -> ${to}): ${message}`);
      try {
        await this.logRepo.save(
          this.logRepo.create({
            tenantId,
            templateCode: code,
            toEmail: to,
            subject,
            status: EmailStatus.FAILED,
            errorMessage: message,
          }),
        );
      } catch {
        // swallow logging failures
      }
      return { status: EmailStatus.FAILED, error: message };
    }
  }

  /** Verify SMTP connectivity and optionally send a test email. */
  async testSmtp(
    tenantId: string,
    to?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transport = await this.buildTransport(tenantId);
      if (!transport) {
        return { success: false, error: 'No active SMTP configuration found' };
      }
      await transport.transporter.verify();
      if (to) {
        const from = transport.fromName
          ? `"${transport.fromName}" <${transport.fromEmail}>`
          : transport.fromEmail;
        const subject = 'SMTP test email';
        try {
          await transport.transporter.sendMail({
            from,
            to,
            subject,
            text: 'This is a test email confirming your SMTP configuration works.',
          });
          await this.logRepo.save(
            this.logRepo.create({
              tenantId,
              templateCode: 'SMTP_TEST',
              toEmail: to,
              subject,
              status: EmailStatus.SENT,
              errorMessage: null,
            }),
          );
        } catch (err: any) {
          const message = err?.message ?? String(err);
          await this.logRepo.save(
            this.logRepo.create({
              tenantId,
              templateCode: 'SMTP_TEST',
              toEmail: to,
              subject,
              status: EmailStatus.FAILED,
              errorMessage: message,
            }),
          );
          return { success: false, error: message };
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? String(err) };
    }
  }
}
