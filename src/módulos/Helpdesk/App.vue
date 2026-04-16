<script setup lang="ts">
import { ref } from 'vue'
import Tickets from './Tickets.vue'

const tela = ref<'formulario' | 'lista'>('formulario')

// estado dos campos do formulário
const name = ref('')
const email = ref('')
const telefone = ref('')
const assunto = ref('')
const mensagem = ref('')

// tipo das chaves do objeto formErrors
type FieldKey = 'name' | 'email' | 'telefone' | 'assunto' | 'mensagem'

// estado dos erros de validação
const formErrors = ref<Record<FieldKey, string>>({
  name: '',
  email: '',
  telefone: '',
  assunto: '',
  mensagem: '',
})

// limpa o erro de um campo específico
function clearFieldError(field: FieldKey) {
  formErrors.value[field] = ''
}

// valida o formulário
function validateForm() {
  const emailTrim = email.value.trim()
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)

  formErrors.value.name = name.value.trim() === '' ? 'Nome é obrigatório' : ''
  formErrors.value.email =
    emailTrim === '' ? 'E-mail é obrigatório' : !emailOk ? 'E-mail inválido' : ''
  formErrors.value.telefone =
    telefone.value.trim() === '' ? 'Telefone é obrigatório' : ''
  formErrors.value.assunto = assunto.value.trim() === '' ? 'Assunto é obrigatório' : ''
  formErrors.value.mensagem =
    mensagem.value.trim() === '' ? 'Mensagem é obrigatória' : ''
}

// envia o formulário
async function onSubmit(e: Event) {
  e.preventDefault()
  validateForm()
  const hasErrors = Object.values(formErrors.value).some((msg) => msg !== '')
  if (hasErrors) return
  await enviarChamado()
}

// monta o payload para o Octadesk
function montarPayloadOctadesk() {
  const descricao = [mensagem.value.trim()]
  if (telefone.value.trim()) {
    descricao.push(`Telefone: ${telefone.value.trim()}`)
  }
  return {
    summary: assunto.value.trim() || 'Chamado pelo site',
    description: descricao.filter(Boolean).join('\n\n'),
    status: { name: 'Novo' },
    requester: {
      name: name.value.trim(),
      email: email.value.trim(),
    },
    priority: { name: 'Normal' },
  }
}

// envia o chamado para o Octadesk
const enviarChamado = async () => {
  const backendUrl = import.meta.env.VITE_TICKETS_API_URL?.trim()

  let url: string
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let body: unknown

  if (backendUrl) {
    url = backendUrl
    body = {
      name: name.value,
      email: email.value,
      telefone: telefone.value,
      assunto: assunto.value,
      mensagem: mensagem.value,
    }
  } else if (import.meta.env.DEV) {
    url = '/octadesk-api/tickets'
    body = montarPayloadOctadesk()
  } else {
    const host = import.meta.env.VITE_OCTADESK_API_HOST?.trim()
    const apiKey =
      import.meta.env.VITE_OCTADESK_X_API_KEY?.trim() ||
      import.meta.env.VITE_OCTADESK_API_TOKEN?.trim()
    const agentEmail = import.meta.env.VITE_OCTADESK_AGENT_EMAIL?.trim()
    if (!host || !apiKey || !agentEmail) {
      alert(
        'Em produção use VITE_TICKETS_API_URL (backend) ou defina VITE_OCTADESK_API_HOST, VITE_OCTADESK_X_API_KEY e VITE_OCTADESK_AGENT_EMAIL. Veja .env.example.',
      )
      return
    }
    url = `https://${host}/tickets`
    headers = {
      ...headers,
      'X-API-KEY': apiKey,
      'octa-agent-email': agentEmail,
    }
    body = montarPayloadOctadesk()
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      console.error('Erro da API:', response.status, data)
      alert('Erro ao abrir chamado. Verifique os dados e tente novamente.')
      return
    }

    console.log('Resposta:', data)
    alert('Chamado enviado com sucesso!')
    limparCampos()
  } catch (error) {
    console.error('Erro de rede ou ao processar resposta:', error)
    alert('Não foi possível contatar o servidor. Tente novamente.')
  }
}

// limpa os campos do formulário
function limparCampos() {
  name.value = ''
  email.value = ''
  telefone.value = ''
  assunto.value = ''
  mensagem.value = ''
  formErrors.value = {
    name: '',
    email: '',
    telefone: '',
    assunto: '',
    mensagem: '',
  }
}

// função para anexar arquivo
const openFileDialog = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      const maxSize = 2 * 1024 * 1024 // 2MB
      if (file.size > maxSize) {
        alert('A imagem deve ter no máximo 2MB')
        return
      }
      console.log(`Imagem selecionada: ${file.name}`)
      confirm(`confirma o envio do arquivo ${file.name}?`)
      return
    }
    alert('Não foi possível selecionar a imagem')
  }
  input.click()
}
</script>

<template>
  <Tickets v-if="tela === 'lista'" @voltar="tela = 'formulario'" />
  <div
    v-else
    class="min-h-screen w-full bg-[#F8F9FA] font-sans text-[#1A202C] antialiased"
  >
    <div
      class="mx-auto w-full max-w-[min(100%,1280px)] px-6 py-12 pb-16 sm:px-8 lg:px-10"
    >
      <div
        class="grid w-full grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12 lg:items-stretch"
      >
        <div class="min-w-0">
          <h1 class="mb-2 text-[28px] font-bold tracking-tight text-[#1A202C]">
            Ajuda
          </h1>
          <p class="mb-8 text-[15px] font-normal leading-relaxed text-[#A0AEC0]">
            Descreva sua solicitação para que possamos atendê-lo.
          </p>

          <form @submit="onSubmit">
            <div
              class="grid grid-cols-3 gap-5 max-md:grid-cols-1 max-md:gap-0"
            >
              <div class="mb-[22px] max-md:mb-[22px]">
                <label
                  for="nome"
                  class="mb-2 block text-sm font-semibold text-[#1A202C]"
                  >Seu nome</label
                >
                <input
                  id="nome"
                  v-model="name"
                  type="text"
                  name="nome"
                  autocomplete="name"
                  placeholder="Seu nome completo"
                  class="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 text-[15px] text-[#1A202C] placeholder:text-[#A0AEC0] outline-none transition-colors focus:border-[#CBD5E0]"
                  :class="formErrors.name ? 'border-red-400' : ''"
                  @input="clearFieldError('name')"
                />
                <p
                  v-if="formErrors.name"
                  role="alert"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ formErrors.name }}
                </p>
              </div>
              <div class="mb-[22px] max-md:mb-[22px]">
                <label
                  for="email"
                  class="mb-2 block text-sm font-semibold text-[#1A202C]"
                  >E-mail</label
                >
                <input
                  id="email"
                  v-model="email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  placeholder="seuemail@dominio.com.br"
                  class="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 text-[15px] text-[#1A202C] placeholder:text-[#A0AEC0] outline-none transition-colors focus:border-[#CBD5E0]"
                  :class="formErrors.email ? 'border-red-400' : ''"
                  @input="clearFieldError('email')"
                />
                <p
                  v-if="formErrors.email"
                  role="alert"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ formErrors.email }}
                </p>
              </div>
              <div class="mb-0 max-md:mb-[22px]">
                <label
                  for="telefone"
                  class="mb-2 block text-sm font-semibold text-[#1A202C]"
                  >Telefone de contato</label
                >
                <input
                  id="telefone"
                  v-model="telefone"
                  type="tel"
                  name="telefone"
                  autocomplete="tel"
                  placeholder="(99) 99999-9999"
                  class="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 text-[15px] text-[#1A202C] placeholder:text-[#A0AEC0] outline-none transition-colors focus:border-[#CBD5E0]"
                  :class="formErrors.telefone ? 'border-red-400' : ''"
                  @input="clearFieldError('telefone')"
                />
                <p
                  v-if="formErrors.telefone"
                  role="alert"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ formErrors.telefone }}
                </p>
              </div>
            </div>

            <div class="mt-[22px]">
              <label
                for="assunto"
                class="mb-2 block text-sm font-semibold text-[#1A202C]"
                >Assunto</label
              >
              <input
                id="assunto"
                v-model="assunto"
                type="text"
                name="assunto"
                placeholder="Indique o assunto"
                class="w-full rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 text-[15px] text-[#1A202C] placeholder:text-[#A0AEC0] outline-none transition-colors focus:border-[#CBD5E0]"
                :class="formErrors.assunto ? 'border-red-400' : ''"
                @input="clearFieldError('assunto')"
              />
              <p
                v-if="formErrors.assunto"
                role="alert"
                class="mt-1 text-sm text-red-600"
              >
                {{ formErrors.assunto }}
              </p>
            </div>

            <div class="mt-[22px]">
              <label
                for="mensagem"
                class="mb-2 block text-sm font-semibold text-[#1A202C]"
                >Mensagem</label
              >
              <div class="relative">
                <textarea
                  id="mensagem"
                  v-model="mensagem"
                  name="mensagem"
                  rows="7"
                  placeholder="Explique sua dificuldade ou dúvida"
                  class="min-h-[180px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-3 pb-11 text-[15px] leading-relaxed text-[#1A202C] placeholder:text-[#A0AEC0] outline-none transition-colors focus:border-[#CBD5E0]"
                  :class="formErrors.mensagem ? 'border-red-400' : ''"
                  @input="clearFieldError('mensagem')"
                />
                <p
                  v-if="formErrors.mensagem"
                  role="alert"
                  class="mt-1 text-sm text-red-600"
                >
                  {{ formErrors.mensagem }}
                </p>
                <button
                  type="button"
                  class="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-md text-[#A0AEC0] hover:bg-black/[0.04] hover:text-[#718096]"
                  aria-label="Anexar arquivo"
                  title="Anexar arquivo"
                  @click="openFileDialog"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path
                      d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <br />

            <button
              type="submit"
              class="mt-2 rounded-lg bg-[#1A202C] px-7 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#2D3748]"
            >
              Abrir chamado
            </button>
          </form>
        </div>

        <aside class="flex w-full min-w-0 flex-col pt-1 lg:w-[260px]">
          <h2 class="mb-5 text-[17px] font-bold text-[#1A202C]">
            Outros canais
          </h2>
          <div
            class="mb-4 flex items-center gap-3 text-sm leading-snug text-[#718096]"
          >
            <svg
              class="shrink-0 text-[#A0AEC0]"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path
                d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"
              />
            </svg>
            <span>0800 59 16 372</span>
          </div>
          <div class="flex items-center gap-3 text-sm leading-snug text-[#718096]">
            <svg
              class="shrink-0 text-[#A0AEC0]"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
            <span>suporte@vocaretech.com.br</span>
          </div>

          <div class="mt-auto flex justify-end pt-10 max-lg:mt-8 max-lg:w-full max-lg:pt-6">
            <button
              type="button"
              class="max-w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold leading-snug text-[#1A202C] transition-colors hover:bg-[#F7FAFC] max-lg:w-full max-lg:text-center"
              @click="tela = 'lista'"
            >
              Ver chamados no Octadesk
            </button>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
