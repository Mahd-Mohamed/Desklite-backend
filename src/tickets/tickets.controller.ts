import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SuccessMessage } from '../common/decorators/success-message.decorator';
import { Role } from '../common/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @Roles(Role.EMPLOYEE)
  @SuccessMessage('Ticket created successfully')
  async create(@Body() createTicketDto: CreateTicketDto, @Request() req: any) {
    return this.ticketsService.create(createTicketDto, req.user.userId);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.ticketsService.findAll(req.user);
  }

  @Get('available')
  @Roles(Role.SUPPORT, Role.MANAGER)
  async findAvailable() {
    return this.ticketsService.findAvailable();
  }

  @Get('stats')
  @Roles(Role.MANAGER)
  async getStats() {
    return this.ticketsService.getStats();
  }

  @Get('workload')
  @Roles(Role.MANAGER)
  async getWorkload() {
    return this.ticketsService.getWorkload();
  }

  @Get('staff')
  @Roles(Role.MANAGER)
  async getSupportStaff() {
    return this.ticketsService.getSupportStaff();
  }

  @Patch(':id/assign')
  @Roles(Role.MANAGER)
  @SuccessMessage('Ticket assigned successfully')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.assign(id, dto.userId, req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(id);
  }

  @Post(':id/claim')
  @Roles(Role.SUPPORT, Role.MANAGER)
  @SuccessMessage('Ticket claimed. It is now assigned to you.')
  async claim(@Param('id') id: string, @Request() req: any) {
    return this.ticketsService.claim(id, req.user.userId);
  }

  @Patch(':id/status')
  @Roles(Role.SUPPORT, Role.MANAGER)
  @SuccessMessage('Ticket status updated')
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Request() req: any,
  ) {
    return this.ticketsService.changeStatus(id, req.user.userId, dto);
  }

  @Post(':id/comments')
  @SuccessMessage('Comment added')
  async addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @Request() req: any,
  ) {
    return this.ticketsService.addComment(id, req.user.userId, dto.message);
  }

  @Post(':id/close')
  @SuccessMessage('Ticket closed. Thanks for confirming!')
  async close(@Param('id') id: string, @Request() req: any) {
    return this.ticketsService.close(id, req.user.userId);
  }
}
