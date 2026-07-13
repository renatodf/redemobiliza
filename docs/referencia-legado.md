# Referência — Sistema legado (Gestão de Gabinete)

> Convertido de `sistema meu banco de dados.docx` (documento original mantido fora do controle de versão). Descreve o sistema legado em Ruby on Rails que serviu de referência/inspiração para o Rede Mobiliza, e a especificação original do fluxo de cadastro público.
>
> Algumas linhas do documento original já estavam truncadas (nomes de controller cortados no meio) — preservadas aqui como estavam, sem completar por suposição.

## Módulos do Sistema Gestão de Gabinete

### 1. Autenticação e Controle de Acesso
- Login/sessões (`sessions_controller`)
- Controle de permissões por perfil (`ability.rb` — CanCanCan)
- Recuperação de senha (`password_recovery_link`)
- Multi-tenant (`tenant`, `tenants_controller`)

### 2. Pessoas (Cadastro de Cidadãos)
- Cadastro completo de pessoas (`person`, `people_controller`)
- Telefones, imagens, vídeos associados (`phone`, `imagem`, `video`)
- Observações sobre pessoas (`person_observation`, `people/observations_controller`)
- Curriculum (`curriculum`, `curriculum_controller`)
- Busca e filtros paginados (`people/search_service`, `person_filter_service`)
- Relatórios de pessoas (`report_service`)
- Redes de contato (`user_network`, `user_networks_controller`)

### 3. Demandas / Requerimentos
- Cadastro de demandas (`request`, `requests_controller`)
- Fila de demandas (`requests_queue`, `requests_queues_controller`)
- Documentos anexados às demandas (`request_document`, `request_documents_controller`)
- Observações de demandas (`requests/observations_controller`)
- Consulta via e-mail (`requests/apiconsultaemail_controller`)
- Notificações de demandas pendentes (`pending_requests_service`, `pending_requests_notifications_job`)

### 4. Tarefas
- Cadastro e gestão de tarefas (`task`, `tasks_controller`)
- Fila de tarefas (`tasks_queue`, `tasks_queues_controller`)
- Observações de tarefas (`tasks/observations_controller`)

### 5. Agenda / Eventos
- Calendário (`calendar`, `calendars_controller`)
- Eventos do calendário (`calendar_event`, `events_controller`)
- Observações de eventos (`event_observation`)

### 6. Publicações
- Publicações gerais (`publication`, `publications_controll[er]` — truncado no original)
- Publicações avulsas/desvinculadas (`detached_publication`)

### 7. Pesquisas / Enquetes
- Criação de enquetes (`survey`, `surveys_controller`)
- Respostas (`survey_answer`)
- Geração de relatórios de enquetes (`surveys/generate_report_service`)

### 8. Notificações
- Notificações push (`push_notification`)
- Notificações in-app (`notification`, `notifications_contr[oller]` — truncado no original)
- Aniversários (`birthday_service`, `birthday_emails_job`)
- Notificação de pessoa atendida/criada (`person_attendedice`)
- Notificação de demanda criada (`request_created_service`)

### 9. Comunicação (SMS e E-mail)
- Envio de SMS (`sms_config`, `sms_controller`, `sms_service`, `locasms_provider`)
- Envio de e-mail (`email_config`, `email_controller`)
- Jobs de SMS (`send_single_sms_job`, `send_single_sms_unit_job`)

### 10. Exportação de Dados
- Exportação geral (`export_result`, `export_results_controller`)
- Exportação de listas de pessoas e redes (`export_person`)
- Job de exportação genérica (`export_job`)

### 11. Tags
- Categorização por tags (`tag`, `tags_controller`)

### 12. API REST (v1)
- Endpoint de usuários (`api/v1/users`)
- Base e configurações padrão da API (`api/v1/base`, `api/v[...]` — truncado no original)

### 13. Geolocalização
- Atualização de geolocalização de pessoas/endereços (`up[...]` — truncado no original)

---

São 13 módulos funcionais no total. O sistema é um CRM parlamentar/gabinete com foco em gestão de demandas, cadastro de cidadãos e comunicação.

## Cadastro (spec original)

**Etapa 1 (15 segundos):**
- Nome
- WhatsApp
- Cidade

**Etapa 2 (após enviar):**
- Data de nascimento
- Profissão
- Interesse principal
- E-mail

**Talvez:** Origem do cadastro. Exemplos:
- Instagram
- Facebook
- Evento
- Liderança comunitária
- Indicação
- Atendimento no gabinete
- Site
- WhatsApp

O administrador ou níveis de acesso acima poderão classificar o cadastro em "segmentos" que serão criados por tags.

Poderão também colocar uma observação dentro do cadastro. A ideia é montar um histórico da pessoa cadastrada: se ela esteve no gabinete em alguma outra data, se ela teve alguma demanda atendida, se trabalhou voluntariamente para o candidato etc.
