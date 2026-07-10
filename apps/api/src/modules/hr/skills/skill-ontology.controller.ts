import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SkillOntologyService } from './skill-ontology.service';
import { SkillRelationType } from './entities/skill-relation.entity';
import { AttestationMethod, AttestationStatus } from './entities/skill-attestation.entity';

@ApiTags('hr-skills-ontology')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/skills/ontology')
export class SkillOntologyController {
  constructor(private readonly service: SkillOntologyService) {}

  // ---- Ontology graph ----
  @Post('relations')
  @RequirePermission('hr:skills:manage')
  addRelation(@CurrentUser() user: any, @Body() dto: { fromSkillId: string; toSkillId: string; relationType?: SkillRelationType; note?: string }) {
    return this.service.addRelation(user.tenantId, dto);
  }

  @Delete('relations/:id')
  @RequirePermission('hr:skills:manage')
  removeRelation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.removeRelation(user.tenantId, id);
  }

  @Get('skills/:skillId/neighbourhood')
  @RequirePermission('hr:skills:read')
  @ApiOperation({ summary: 'Related/adjacent skills (both directions)' })
  neighbourhood(@CurrentUser() user: any, @Param('skillId') skillId: string) {
    return this.service.neighbourhood(user.tenantId, skillId);
  }

  @Get('skills/:skillId/prerequisites')
  @RequirePermission('hr:skills:read')
  prerequisites(@CurrentUser() user: any, @Param('skillId') skillId: string) {
    return this.service.prerequisitesOf(user.tenantId, skillId);
  }

  // ---- Proficiency descriptors ----
  @Put('descriptors')
  @RequirePermission('hr:skills:manage')
  @ApiOperation({ summary: 'Replace the proficiency scale for a skill (or the tenant default when skillId omitted)' })
  setDescriptors(@CurrentUser() user: any, @Body() body: { skillId?: string; descriptors: Array<{ level: number; label: string; description?: string }> }) {
    return this.service.setDescriptors(user.tenantId, body?.skillId ?? null, body?.descriptors ?? []);
  }

  @Get('descriptors')
  @RequirePermission('hr:skills:read')
  listDescriptors(@CurrentUser() user: any, @Query('skillId') skillId?: string) {
    return this.service.listDescriptors(user.tenantId, skillId);
  }

  // ---- Attestations ----
  @Post('attestations')
  @RequirePermission('hr:skills:read')
  @ApiOperation({ summary: 'Request an attestation (self, manager, cert, assessment)' })
  requestAttestation(@CurrentUser() user: any, @Body() dto: { employeeId: string; skillId: string; proficiencyClaimed: number; method?: AttestationMethod; evidenceUrl?: string; note?: string; expiresAt?: string }) {
    return this.service.requestAttestation(user.tenantId, { ...dto, attestedByUserId: user.id });
  }

  @Get('attestations')
  @RequirePermission('hr:skills:read')
  listAttestations(@CurrentUser() user: any, @Query('employeeId') employeeId?: string, @Query('skillId') skillId?: string, @Query('status') status?: AttestationStatus) {
    return this.service.listAttestations(user.tenantId, { employeeId, skillId, status });
  }

  @Post('attestations/:id/verify')
  @RequirePermission('hr:skills:attest')
  verifyAttestation(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.verifyAttestation(user.tenantId, id, user.id);
  }

  @Post('attestations/:id/reject')
  @RequirePermission('hr:skills:attest')
  rejectAttestation(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.service.rejectAttestation(user.tenantId, id, user.id, body?.note);
  }

  @Get('employees/:employeeId/coverage')
  @RequirePermission('hr:skills:read')
  @ApiOperation({ summary: 'Verified vs self-declared skill coverage for an employee' })
  coverage(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.attestationCoverage(user.tenantId, employeeId);
  }
}
