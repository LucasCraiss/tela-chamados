<script setup lang="ts">
import axios, { type AxiosError } from 'axios'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const emit = defineEmits<{ voltar: [] }>()

/** Campos usados na listagem (Octadesk devolve mais campos). */
interface OctadeskTicketRow {
  id: string
  number: number
  summary: string
  status?: { name?: string }
  requester?: { name?: string; email?: string }
}

interface RequesterGroup {
  requesterName: string
  tickets: OctadeskTicketRow[]
}

const tickets = ref<OctadeskTicketRow[]>([])
const loading = ref(false)
const errorMessage = ref('')
const filterRequester = ref<string>('')

function normalizeHost(raw: string): string {
  let h = raw.trim()
  h = h.replace(/^https?:\/\//i, '')
  return h.split('/')[0] || ''
}

function getOctadeskConfig() {
  const host = normalizeHost(import.meta.env.VITE_OCTADESK_API_HOST ?? '')
  const token =
    import.meta.env.VITE_OCTADESK_X_API_KEY?.trim() ||
    import.meta.env.VITE_OCTADESK_API_TOKEN?.trim() ||
    ''
  const agentEmail = import.meta.env.VITE_OCTADESK_AGENT_EMAIL?.trim() || ''
  return { host, token, agentEmail }
}

/** Produção: chamada direta à API (exige CORS liberado no Octadesk ou app no mesmo domínio da API). */
function createOctadeskAxiosProduction() {
  const { host, token, agentEmail } = getOctadeskConfig()
  if (!host || !token || !agentEmail) {
    throw new Error(
      'Em produção defina VITE_OCTADESK_API_HOST, VITE_OCTADESK_X_API_KEY (ou VITE_OCTADESK_API_TOKEN) e VITE_OCTADESK_AGENT_EMAIL no .env.',
    )
  }
  return axios.create({
    baseURL: `https://${host}`,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-KEY': token,
      'octa-agent-email': agentEmail,
    },
  })
}

/**
 * Desenvolvimento: mesma origem do Vite → evita CORS.
 * Credenciais vão no `vite.config` (OCTADESK_*), não no browser.
 */
function createOctadeskAxiosDev() {
  return axios.create({
    baseURL: '',
    headers: {
      Accept: 'application/json',
    },
  })
}

function parseTicketsPayload(data: unknown): OctadeskTicketRow[] {
  if (Array.isArray(data)) {
    return data as OctadeskTicketRow[]
  }
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: OctadeskTicketRow[] }).data
  }
  if (data && typeof data === 'object' && Array.isArray((data as { tickets?: unknown }).tickets)) {
    return (data as { tickets: OctadeskTicketRow[] }).tickets
  }
  return []
}

async function loadTickets() {
  errorMessage.value = ''
  loading.value = true
  tickets.value = []
  try {
    const dev = import.meta.env.DEV
    const client = dev ? createOctadeskAxiosDev() : createOctadeskAxiosProduction()
    const path = dev ? '/octadesk-api/tickets' : '/tickets'
    const { data } = await client.get<unknown>(path, {
      params: {
        page: 1,
        limit: 100,
      },
    })
    tickets.value = parseTicketsPayload(data)
  } catch (e) {
    const ax = e as AxiosError<{ message?: string }>
    let msg =
      ax.response?.data?.message ||
      ax.message ||
      'Não foi possível carregar os chamados.'
    if (!ax.response && (ax.code === 'ERR_NETWORK' || ax.message === 'Network Error')) {
      msg = import.meta.env.DEV
        ? 'Rede/CORS: em dev a lista usa o proxy /octadesk-api. Coloque OCTADESK_API_HOST, OCTADESK_API_TOKEN (ou OCTADESK_X_API_KEY) e OCTADESK_AGENT_EMAIL no .env, reinicie o npm run dev e tente de novo.'
        : 'Erro de rede ou bloqueio CORS. Use um backend ou proxy na mesma origem do site para chamar o Octadesk.'
    }
    errorMessage.value = msg
    console.error('Octadesk list tickets:', e)
  } finally {
    loading.value = false
  }
}

/** Agrupa por nome do solicitante (requester.name), ordenado A–Z. */
const groupsByRequester = computed((): RequesterGroup[] => {
  const map = new Map<string, OctadeskTicketRow[]>()
  for (const t of tickets.value) {
    const name = (t.requester?.name ?? '').trim() || 'Sem nome'
    if (!map.has(name)) map.set(name, [])
    map.get(name)!.push(t)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
    .map(([requesterName, list]) => ({
      requesterName,
      tickets: [...list].sort((x, y) => (y.number ?? 0) - (x.number ?? 0)),
    }))
})

const requesterOptions = computed(() => groupsByRequester.value.map((g) => g.requesterName))

const displayedGroups = computed((): RequesterGroup[] => {
  const q = filterRequester.value.trim()
  if (!q) return groupsByRequester.value
  return groupsByRequester.value.filter((g) =>
    g.requesterName.toLowerCase().includes(q.toLowerCase()),
  )
})

function statusLabel(t: OctadeskTicketRow): string {
  return t.status?.name?.trim() || '—'
}

/** Resposta de GET /tickets/{number} — campos opcionais conforme API. */
interface OctadeskTicketDetail {
  id?: string
  number?: number
  summary?: string
  description?: string
  status?: { name?: string }
  requester?: { name?: string; email?: string }
  priority?: { name?: string }
  createdAt?: string
  updatedAt?: string
}

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const ticketDetail = ref<OctadeskTicketDetail | null>(null)

async function fetchTicketByNumber(ticketNumber: number): Promise<OctadeskTicketDetail> {
  const dev = import.meta.env.DEV
  const client = dev ? createOctadeskAxiosDev() : createOctadeskAxiosProduction()
  const path = dev
    ? `/octadesk-api/tickets/${encodeURIComponent(String(ticketNumber))}`
    : `/tickets/${encodeURIComponent(String(ticketNumber))}`
  const { data } = await client.get<OctadeskTicketDetail>(path)
  return data
}

async function openTicketDetail(ticket: OctadeskTicketRow) {
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  ticketDetail.value = null
  try {
    ticketDetail.value = await fetchTicketByNumber(ticket.number)
  } catch (e) {
    const ax = e as AxiosError<{ message?: string }>
    detailError.value =
      ax.response?.data?.message ||
      ax.message ||
      'Não foi possível carregar o chamado.'
    console.error('Octadesk get ticket:', e)
  } finally {
    detailLoading.value = false
  }
}

function closeTicketDetail() {
  detailOpen.value = false
  detailError.value = ''
  ticketDetail.value = null
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR')
}

function onDetailKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeTicketDetail()
}

watch(detailOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onDetailKeydown)
  } else {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', onDetailKeydown)
  }
})

onMounted(() => {
  void loadTickets()
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onDetailKeydown)
})
</script>

<template>
  <main class="bg-[#F8F9FA]"> </main>
  <div
    class="min-h-screen w-full bg-[#F8F9FA] font-sans text-[#1A202C] antialiased"
  >
    <div
      class="mx-auto w-full max-w-[min(90%,1280px)] px-6 py-10 pb-16 sm:px-8 lg:px-10"
    >
      <div
        class="grid w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-14 lg:items-stretch"
      >
        <div class="min-w-0">
          <h1 class=" text-[28px] font-bold tracking-tight text-[#1A202C]">
            Chamados
          </h1>

          <div
            v-if="errorMessage"
            class="mb-6 rounded-lg border border-red-200 bg-red-50 px-2 py-3 text-sm text-red-800"
            role="alert"
          >
            {{ errorMessage }}
          </div>

          <div
            class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <label
              class="flex min-w-0 flex-1 flex-col gap-3 text-sm font-semibold text-[#1A202C] sm:max-w-md"
            >
              Filtrar nome do solicitante
              <input
                v-model="filterRequester"
                type="search"
                list="requester-names-tickets"
                autocomplete="off"
                placeholder="Digite parte do nome ou escolha na lista"
                class="w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[15px] transition-colors focus:border-[#CBD5E0]"
              />
              <datalist id="requester-names-tickets">
                <option
                  v-for="name in requesterOptions"
                  :key="name"
                  :value="name"
                />
              </datalist>
            </label>
            <p class="text-sm text-[#718096] self-end py-2 absolute right-154">
              {{ tickets.length }} chamado(s) · {{ groupsByRequester.length }} cliente(s)
            </p>
          </div>

          <div
            v-if="loading && !tickets.length"
            class="py-8 text-center text-[#718096]"
          >
            Carregando chamados…
          </div>

          <div
            v-else-if="!loading && !tickets.length && !errorMessage"
            class="py-16 text-center text-[#718096]"
          >
            Nenhum chamado retornado.
          </div>

          <div v-else class="mt-10 space-y-16">
            <section
              v-for="list in displayedGroups"
              :key="list.requesterName"
              class="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm max-md:p-4"
            >
              <h2
                class="mb-4 flex flex-wrap items-baseline gap-2 border-b border-[#EDF2F7] pb-3 text-lg font-bold text-[#1A202C]"
              >
                <span>{{ list.requesterName }}</span>
                <span class="text-sm font-normal text-[#A0AEC0]">
                  ({{ list.tickets.length }})
                </span>
              </h2>
              <ul class="flex flex-col">
                <li
                  v-for="ticket in list.tickets"
                  :key="ticket.id"
                  class="flex gap-3 border-b border-[#E2E8F0] py-4 last:border-b-0"
                >
                  <div class="min-w-0 flex-1 flex flex-col gap-2">
                    <div
                      class="text-xs font-semibold uppercase tracking-wide text-[#A0AEC0]"
                    >
                      Nº {{ ticket.number }}
                    </div>
                    <p
                      class="text-[15px] font-semibold leading-snug text-[#1A202C]"
                    >
                      {{ ticket.summary || '—' }}
                    </p>
                    <div
                      class="flex flex-wrap items-center gap-2 text-sm text-[#718096]"
                    >
                      <span class="font-medium text-[#4A5568]">Solicitante:</span>
                      <span>{{ ticket.requester?.name?.trim() || '—' }}</span>
                      <span class="mx-1 text-[#CBD5E0]">·</span>
                      <span class="font-medium text-[#4A5568]">Status:</span>
                      <span
                        class="inline-flex rounded-full bg-[#EDF2F7] px-1.5 py-0.5 text-xs font-semibold text-[#2D3748]"
                      >
                        {{ statusLabel(ticket) }}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="shrink-0 self-center rounded-lg p-2.5 text-[#718096] transition-colors hover:bg-[#EDF2F7] hover:text-[#1A202C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBD5E0]"
                    aria-label="Abrir chamado completo"
                    @click="openTicketDetail(ticket)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </li>
              </ul>
            </section>

            <p
              v-if="filterRequester.trim() && displayedGroups.length === 0"
              class="text-center text-sm text-[#718096]"
            >
              Nenhum cliente encontrado para “{{ filterRequester.trim() }}”.
            </p>
          </div>
        </div>
        

        <aside class="flex w-full min-w-0 flex-col pt-1 lg:w-[260px]">

          <div
            class="mt-auto flex flex-col gap-3 pt-10 max-lg:mt-8 max-lg:pt-6"
          >
            <button
              type="button"
              class="w-auto self-end rounded-lg border border-[#E2E8F0] bg-white px-4 py-1.5 text-sm font-semibold text-[#1A202C] transition-colors hover:bg-[#F7FAFC] disabled:opacity-60"
              :disabled="loading"
              @click="loadTickets"
            >
              {{ loading ? 'Atualizando…' : 'Atualizar' }}
            </button>
            <button
              type="button"
              class="w-auto self-end rounded-lg bg-[#1A202C] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2D3748]"
              @click="emit('voltar')"
            >
              Voltar ao formulário
            </button>
          </div>
        </aside class= "bg-[#2D3748]">
       </div class= "bg-[#2D3748]">
     </div>

    <Teleport to="body">
      <div
        v-if="detailOpen"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-title"
        @click.self="closeTicketDetail"
      >
        <div
          class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white shadow-xl"
          @click.stop
        >
          <div
            class="sticky top-0 flex items-center justify-between border-b border-[#EDF2F7] bg-white px-5 py-4"
          >
            <h2 id="ticket-detail-title" class="text-lg font-bold text-[#1A202C]">
              Detalhes do chamado
            </h2>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-sm font-semibold text-[#718096] hover:bg-[#F7FAFC] hover:text-[#1A202C]"
              @click="closeTicketDetail"
            >
              x
            </button>
          </div>

          <div class="px-5 py-4">
            <div v-if="detailLoading" class="py-8 text-center text-[#718096]">
              Carregando…
            </div>
            <div
              v-else-if="detailError"
              class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {{ detailError }}
            </div>
            <div v-else-if="ticketDetail" class="space-y-4 text-[15px]">
              <div>
                <span class="text-xs font-semibold uppercase text-[#A0AEC0]">Número</span>
                <p class="mt-0.5 font-semibold text-[#1A202C]">
                  Nº {{ ticketDetail.number ?? '—' }}
                </p>
              </div>
              <div>
                <span class="text-xs font-semibold uppercase text-[#A0AEC0]">Assunto</span>
                <p class="mt-0.5 text-[#1A202C]">
                  {{ ticketDetail.summary || '—' }}
                </p>
              </div>
              <div>
                <span class="text-xs font-semibold uppercase text-[#A0AEC0]">Descrição</span>
                <p class="mt-0.5 whitespace-pre-wrap break-words text-[#4A5568]">
                  {{ ticketDetail.description?.trim() || '—' }}
                </p>
              </div>
              <div class="flex flex-wrap gap-4 text-sm">
                <div>
                  <span class="text-xs font-semibold uppercase text-[#A0AEC0]">Status</span>
                  <p class="mt-0.5">
                    <span
                      class="inline-flex rounded-full bg-[#EDF2F7] px-2 py-0.5 text-xs font-semibold text-[#2D3748]"
                    >
                      {{ ticketDetail.status?.name?.trim() || '—' }}
                    </span>
                  </p>
                </div>
                <div v-if="ticketDetail.priority?.name">
                  <span class="text-xs font-semibold uppercase text-[#A0AEC0]">Prioridade</span>
                  <p class="mt-0.5 text-[#1A202C]">{{ ticketDetail.priority.name }}</p>
                </div>
              </div>
              <div>
              </div>
              <div class="grid gap-2 border-t border-[#EDF2F7] pt-3 text-sm text-[#718096]">
                <p v-if="ticketDetail.createdAt">
                  <span class="font-medium text-[#4A5568]">Aberto em:</span>
                  {{ formatDate(ticketDetail.createdAt) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
