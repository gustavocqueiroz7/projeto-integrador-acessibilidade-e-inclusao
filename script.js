(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "escolaParaTodos_v2";

  // Código de demonstração. Não é uma proteção real: pode ser visto no código-fonte.
  const ADMIN_DEMO_CODE = "EPT2026";

  let state = { users: [], reports: [], supports: [], currentUserId: null };
  let user = null;
  let photoData = "";
  let fontSize = 16;
  let selectedMapSector = "";
  let toastTimer = null;

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowLabel = () => new Date().toLocaleString("pt-BR");
  const normalize = value => String(value || "").trim().toLocaleLowerCase("pt-BR");

  function notify(message) {
    const box = $("toast");
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("show"), 3200);
  }

  function setEntryMessage(message, isError = true) {
    const el = $("entryMessage");
    el.textContent = message;
    el.style.color = isError ? "#a33333" : "#176b52";
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return;

      const parsed = JSON.parse(raw);

      state = {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        supports: Array.isArray(parsed.supports) ? parsed.supports : [],
        currentUserId: parsed.currentUserId || null
      };
    } catch (error) {
      console.error("Não foi possível ler os dados locais:", error);

      state = {
        users: [],
        reports: [],
        supports: [],
        currentUserId: null
      };

      notify("Os dados locais estavam inválidos e não puderam ser carregados.");
    }

    // Migração simples de cadastros antigos que guardavam turma e turno juntos.
    state.users.forEach(account => {
      if (
        account.profile === "Aluno" &&
        account.classroom &&
        !account.shift &&
        account.classroom.includes("/")
      ) {
        const parts = account.classroom.split("/");
        account.classroom = parts.shift().trim();
        account.shift = parts.join("/").trim();
      }

      if (typeof account.shift !== "string") {
        account.shift = "";
      }
    });

    user = state.users.find(item => item.id === state.currentUserId) || null;

    if (!user) {
      state.currentUserId = null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Erro ao salvar no armazenamento local:", error);
      notify("Não foi possível salvar. O armazenamento do navegador pode estar cheio.");
      return false;
    }
  }

  // Hash simples apenas para evitar manter a senha em texto puro no exemplo.
  // Isso NÃO equivale a autenticação segura; os dados continuam acessíveis no navegador.
  function demoPasswordHash(value) {
    let hash = 2166136261;

    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return `demo-${(hash >>> 0).toString(16)}`;
  }

  // MOSTRAR OU ESCONDER TURMA E TURNO NO CADASTRO
  function syncStudentFields() {
    const isStudent = $("registerProfile").value === "Aluno";

    $("registerStudentFields").hidden = !isStudent;

    $("registerClass").required = isStudent;
    $("registerShift").required = isStudent;

    if (!isStudent) {
      $("registerClass").value = "";
      $("registerShift").value = "";
    }
  }

  // MOSTRAR OU ESCONDER TURMA E TURNO NO PERFIL
  function syncProfileStudentFields() {
    const isStudent = $("profileRoleEdit").value === "Aluno";

    $("profileStudentFields").hidden = !isStudent;

    $("profileClassEdit").required = isStudent;
    $("profileShiftEdit").required = isStudent;

    if (!isStudent) {
      $("profileClassEdit").value = "";
      $("profileShiftEdit").value = "";
    }
  }

  function switchEntry(mode) {
    const register = mode === "register";

    $("registerPane").hidden = !register;
    $("loginPane").hidden = register;

    $("showRegister").classList.toggle("active", register);
    $("showLogin").classList.toggle("active", !register);

    $("showRegister").setAttribute("aria-selected", String(register));
    $("showLogin").setAttribute("aria-selected", String(!register));

    setEntryMessage("");
  }

  function enterApp(account) {
    user = account;
    state.currentUserId = account.id;

    saveState();

    $("entry").hidden = true;
    $("accessBar").hidden = false;
    $("app").hidden = false;

    $("who").textContent = account.isAdmin
      ? "Administrador · demonstração"
      : `${account.name} · ${account.profile}`;

    $("schoolLabel").textContent = account.school
      ? `Comunidade: ${account.school}`
      : "Área de demonstração administrativa";

    $("adminNav").hidden = !account.isAdmin;

    showTab("home");
    renderAll();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveApp() {
    state.currentUserId = null;

    saveState();

    user = null;

    $("app").hidden = true;
    $("accessBar").hidden = true;
    $("entry").hidden = false;

    $("loginForm").reset();
    $("registerForm").reset();
    $("adminLoginForm").reset();

    syncStudentFields();
    switchEntry("login");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showTab(tab) {
    if (tab === "admin" && !user?.isAdmin) {
      notify("A área de administração é exclusiva do acesso demonstrativo.");
      return;
    }

    document.querySelectorAll(".section").forEach(section => {
      section.classList.toggle("active", section.id === tab);
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });

    if (tab === "profile") populateProfile();
    if (tab === "barriers") renderReports("allDemands");
    if (tab === "professionals") renderSupports();
    if (tab === "admin") renderAdmin();

    const section = $(tab);

    if (section) {
      section.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    }
  }

  function statusClass(status) {
    return status === "Resolvido"
      ? "resolved"
      : status === "Em andamento"
        ? "progress"
        : "reported";
  }

  function canManage(report) {
    return Boolean(user && (user.isAdmin || report.userId === user.id));
  }

  function commentsMarkup(report) {
    const comments = Array.isArray(report.comments) ? report.comments : [];

    return `<div class="comment-area">
      <strong class="small">💬 Comentários (${comments.length})</strong>

      <div class="comment-list">
        ${comments.length
          ? comments.map(comment => `
            <div class="comment">
              <strong>${escapeHTML(comment.author || "Participante")}</strong>
              <span class="small muted"> · ${escapeHTML(comment.date || "")}</span>
              <p>${escapeHTML(comment.text)}</p>
            </div>
          `).join("")
          : `<p class="small muted">Ainda não há comentários.</p>`
        }
      </div>

      <form class="comment-form" data-comment-form="${escapeHTML(report.id)}">
        <input
          name="comment"
          maxlength="350"
          aria-label="Escreva um comentário"
          placeholder="Escreva um comentário..."
          required
        >
        <button class="btn secondary btn-small" type="submit">Enviar</button>
      </form>
    </div>`;
  }

  function demandCard(report, adminMode = false) {
    const photo = report.photo
      ? `<img class="photo" src="${report.photo}" alt="${escapeHTML(report.alt || "Fotografia da barreira registrada")}" loading="lazy">`
      : "";

    const author = report.anonymous
      ? "Participante anônimo"
      : (report.author || "Participante");

    const votes = Array.isArray(report.votedBy) ? report.votedBy : [];

    const alreadyVoted = user && votes.includes(user.id);

    const history = Array.isArray(report.history) && report.history.length
      ? report.history
      : [{ status: report.status, date: "Status atual" }];

    const statusEditor = canManage(report)
      ? `
        <div class="status-editor">
          <label for="status-${escapeHTML(report.id)}">Atualizar andamento</label>
          <select data-status="${escapeHTML(report.id)}" id="status-${escapeHTML(report.id)}">
            <option ${report.status === "Reportado" ? "selected" : ""}>Reportado</option>
            <option ${report.status === "Em andamento" ? "selected" : ""}>Em andamento</option>
            <option ${report.status === "Resolvido" ? "selected" : ""}>Resolvido</option>
          </select>
        </div>
      `
      : "";

    const adminActions = adminMode && user?.isAdmin
      ? `
        <div class="actions">
          <button class="btn outline btn-small" type="button" data-delete-report="${escapeHTML(report.id)}">
            Excluir relato
          </button>
        </div>
      `
      : "";

    return `<article class="demand">
      <div class="demandhead">
        <div>
          <h3>${escapeHTML(report.kind)}</h3>
          <span class="small muted">
            ${escapeHTML(report.sector)} · ${escapeHTML(report.place || "Local não informado")}
          </span>
        </div>
        <span class="tag ${statusClass(report.status)}">${escapeHTML(report.status)}</span>
      </div>

      <p>${escapeHTML(report.description)}</p>
      ${photo}

      <div class="meta">
        <span>Relato de ${escapeHTML(author)}</span>
        <span>· Demanda #${escapeHTML(String(report.id).slice(-6))}</span>
        <span>· ${escapeHTML(report.date || "")}</span>
      </div>

      <div class="vote">
        <span>💚 <strong>${votes.length}</strong> apoio(s)</span>
        <button class="btn secondary" type="button" data-vote="${escapeHTML(report.id)}" ${alreadyVoted ? "disabled" : ""}>
          ${alreadyVoted ? "✓ Você apoiou" : "♡ Apoiar demanda"}
        </button>
      </div>

      ${statusEditor}

      <div class="timeline">
        <div class="timeline-title">Linha do tempo</div>
        ${history.slice(-4).map(item => `
          <div class="timeline-item">
            <span class="timeline-bullet">●</span>
            <span>${escapeHTML(item.status)} · ${escapeHTML(item.date || "Atualização")}</span>
          </div>
        `).join("")}
      </div>

      ${commentsMarkup(report)}
      ${adminActions}
    </article>`;
  }

  function sortReports(list, mode) {
    const priority = {
      "Reportado": 0,
      "Em andamento": 1,
      "Resolvido": 2
    };

    if (mode === "priority") {
      return list.sort((a, b) =>
        priority[a.status] - priority[b.status] ||
        (b.votedBy?.length || 0) - (a.votedBy?.length || 0)
      );
    }

    if (mode === "recent") {
      return list.sort((a, b) => b.createdAt - a.createdAt);
    }

    return list.sort((a, b) =>
      (b.votedBy?.length || 0) - (a.votedBy?.length || 0)
    );
  }

  function renderReports(target) {
    const container = $(target);

    if (!container) return;

    let list = [...state.reports];

    if (target === "homeDemands") {
      list = sortReports(list, "votes").slice(0, 4);
    }

    if (target === "allDemands") {
      const query = normalize($("searchReports")?.value);
      const sector = $("filterSector")?.value || selectedMapSector;
      const status = $("filterStatus")?.value || "";
      const mode = $("sortReports")?.value || "votes";

      if (query) {
        list = list.filter(report =>
          normalize([
            report.kind,
            report.sector,
            report.description,
            report.place
          ].join(" ")).includes(query)
        );
      }

      if (sector) {
        list = list.filter(report => report.sector === sector);
      }

      if (status) {
        list = list.filter(report => report.status === status);
      }

      list = sortReports(list, mode);
    }

    if (target === "myReports" && user) {
      list = list.filter(report => report.userId === user.id);
    }

    container.innerHTML = list.length
      ? list.map(report => demandCard(report)).join("")
      : `<div class="empty">
          ${target === "myReports"
            ? "Você ainda não registrou demandas."
            : "Nenhuma demanda encontrada. Que tal registrar a primeira?"
          }
        </div>`;

    bindDemandActions(container);
  }

  function bindDemandActions(container) {
    container.querySelectorAll("[data-vote]").forEach(button => {
      button.addEventListener("click", () => {
        if (!user || user.isAdmin) {
          notify("Entre como participante para apoiar uma demanda.");
          return;
        }

        const report = state.reports.find(
          item => String(item.id) === button.dataset.vote
        );

        if (!report) return;

        report.votedBy = Array.isArray(report.votedBy)
          ? report.votedBy
          : [];

        if (report.votedBy.includes(user.id)) return;

        report.votedBy.push(user.id);

        saveState();
        renderAll();

        notify("Seu apoio foi registrado!");
      });
    });

    container.querySelectorAll("[data-status]").forEach(select => {
      select.addEventListener("change", () => {
        const report = state.reports.find(
          item => String(item.id) === select.dataset.status
        );

        if (!report || !canManage(report)) return;

        if (report.status !== select.value) {
          report.status = select.value;

          report.history = Array.isArray(report.history)
            ? report.history
            : [];

          report.history.push({
            status: report.status,
            date: nowLabel()
          });

          saveState();
          renderAll();

          notify("Andamento atualizado.");
        }
      });
    });

    container.querySelectorAll("[data-comment-form]").forEach(form => {
      form.addEventListener("submit", event => {
        event.preventDefault();

        if (!user || user.isAdmin) {
          notify("Entre como participante para comentar.");
          return;
        }

        const report = state.reports.find(
          item => String(item.id) === form.dataset.commentForm
        );

        const field = form.elements.comment;
        const text = field.value.trim();

        if (!report || !text) return;

        report.comments = Array.isArray(report.comments)
          ? report.comments
          : [];

        report.comments.push({
          id: makeId("comment"),
          userId: user.id,
          author: user.name,
          text,
          date: nowLabel()
        });

        saveState();
        renderAll();

        notify("Comentário publicado.");
      });
    });

    container.querySelectorAll("[data-delete-report]").forEach(button => {
      button.addEventListener("click", () => {
        if (!user?.isAdmin) return;

        if (!confirm("Tem certeza de que deseja excluir este relato?")) {
          return;
        }

        state.reports = state.reports.filter(
          report => String(report.id) !== button.dataset.deleteReport
        );

        saveState();
        renderAll();

        notify("Relato excluído.");
      });
    });
  }

  function renderSupports() {
    const container = $("supportList");

    if (!container) return;

    const priority = {
      "Urgente": 0,
      "Alta": 1,
      "Moderada": 2
    };

    const sorted = [...state.supports].sort(
      (a, b) => priority[a.level] - priority[b.level]
    );

    container.innerHTML = sorted.length
      ? sorted.map(item => `
        <article class="demand">
          <div class="demandhead">
            <h3>${escapeHTML(item.professional)}</h3>
            <span class="tag ${
              item.level === "Urgente"
                ? "reported"
                : item.level === "Alta"
                  ? "progress"
                  : "resolved"
            }">${escapeHTML(item.level)}</span>
          </div>

          <p>
            Turno: <strong>${escapeHTML(item.shift)}</strong>
            · Turma: ${escapeHTML(item.classroom || "Não informada")}
          </p>

          <p>${escapeHTML(item.description || "Necessidade registrada pela comunidade escolar.")}</p>

          <div class="meta">
            Registro de ${escapeHTML(item.anonymous ? "Participante anônimo" : item.author || "Participante")}
            · ${escapeHTML(item.date || "")}
          </div>
        </article>
      `).join("")
      : `<div class="empty">Ainda não há necessidades registradas.</div>`;
  }

  // PREENCHER OS DADOS DO PERFIL
  function populateProfile() {
    if (!user || user.isAdmin) return;

    $("profileNameEdit").value = user.name || "";
    $("profileRoleEdit").value = user.profile || "Aluno";
    $("profileSchoolEdit").value = user.school || "";

    $("profileClassEdit").value = user.classroom || "";
    $("profileShiftEdit").value = user.shift || "";

    syncProfileStudentFields();

    const initials = (user.name || "EP")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase();

    $("profileAvatar").textContent = initials || "EP";
    $("profileNameHeading").textContent = user.name || "Participante";
    $("profileRoleHeading").textContent = user.profile || "Perfil";

    const studentDetail = user.profile === "Aluno"
      ? `
        <div>
          <span class="profile-detail-label">Turma</span>
          <strong>${escapeHTML(user.classroom || "Não informada")}</strong>
        </div>
        <div>
          <span class="profile-detail-label">Turno</span>
          <strong>${escapeHTML(user.shift || "Não informado")}</strong>
        </div>
      `
      : "";

    $("profileSummary").innerHTML = `
      <div>
        <span class="profile-detail-label">Escola</span>
        <strong>${escapeHTML(user.school || "Não informada")}</strong>
      </div>
      ${studentDetail}
      <div>
        <span class="profile-detail-label">Conta</span>
        <strong>Armazenada neste navegador</strong>
      </div>
    `;

    renderReports("myReports");
  }

  function renderAdmin() {
    if (!user?.isAdmin) return;

    $("adminUsers").textContent = state.users.length;
    $("adminReports").textContent = state.reports.length;
    $("adminSupports").textContent = state.supports.length;

    const container = $("adminDemandList");

    container.innerHTML = state.reports.length
      ? state.reports.map(report => demandCard(report, true)).join("")
      : `<div class="empty">Não há relatos para moderar.</div>`;

    bindDemandActions(container);
  }

  function renderMapCounts() {
    const ids = {
      "Entrada": "Entrada",
      "Pátio": "Pátio",
      "Salas de aula": "Salas",
      "Banheiros": "Banheiros",
      "Biblioteca": "Biblioteca",
      "Outros": "Outros"
    };

    Object.entries(ids).forEach(([sector, suffix]) => {
      const count = state.reports.filter(
        report => report.sector === sector
      ).length;

      const el = $(`mapCount${suffix}`);

      if (el) {
        el.textContent = `${count} ${count === 1 ? "relato" : "relatos"}`;
      }
    });

    document.querySelectorAll("[data-map-sector]").forEach(button => {
      button.classList.toggle(
        "selected",
        Boolean(selectedMapSector) && button.dataset.mapSector === selectedMapSector
      );
    });

    $("mapSelection").textContent = selectedMapSector
      ? `Filtro selecionado: ${selectedMapSector}.`
      : "Nenhum setor selecionado.";
  }

  function renderAll() {
    if (!user) return;

    renderReports("homeDemands");
    renderReports("allDemands");
    renderSupports();
    renderMapCounts();

    $("total").textContent = state.reports.length;

    $("votes").textContent = state.reports.reduce(
      (sum, item) => sum + (item.votedBy?.length || 0),
      0
    );

    $("working").textContent = state.reports.filter(
      item => item.status === "Em andamento"
    ).length;

    $("done").textContent = state.reports.filter(
      item => item.status === "Resolvido"
    ).length;

    if (user.isAdmin) {
      renderAdmin();
    }
  }

  // REDUZIR FOTOS PARA CABER NO ARMAZENAMENTO DO NAVEGADOR
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error("Não foi possível ler a imagem."));
      };

      reader.onload = () => {
        const img = new Image();

        img.onerror = () => {
          reject(new Error("Arquivo de imagem inválido."));
        };

        img.onload = () => {
          const maxSide = 1100;

          const scale = Math.min(
            1,
            maxSide / Math.max(img.width, img.height)
          );

          const canvas = document.createElement("canvas");

          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext("2d");

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.drawImage(
            img,
            0,
            0,
            canvas.width,
            canvas.height
          );

          let quality = 0.78;

          let result = canvas.toDataURL("image/jpeg", quality);

          while (result.length > 550000 && quality > 0.35) {
            quality -= 0.08;
            result = canvas.toDataURL("image/jpeg", quality);
          }

          if (result.length > 650000) {
            reject(new Error("A imagem ficou muito grande. Escolha uma foto menor."));
          } else {
            resolve(result);
          }
        };

        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  }

  // CRIAR RELATO DE BARREIRA
  function createReport(event) {
    event.preventDefault();

    if (!user || user.isAdmin) {
      notify("Entre como participante para registrar demandas.");
      return;
    }

    const report = {
      id: makeId("report"),
      createdAt: Date.now(),
      date: nowLabel(),
      userId: user.id,
      author: user.name,
      anonymous: $("anonymousReport").checked,
      sector: $("sector").value,
      kind: $("kind").value,
      description: $("description").value.trim(),
      place: $("locationDetail").value.trim(),
      alt: $("altText").value.trim(),
      photo: photoData,
      status: "Reportado",
      votedBy: [],
      comments: [],
      history: [{ status: "Reportado", date: nowLabel() }]
    };

    state.reports.unshift(report);

    if (!saveState()) {
      state.reports.shift();
      return;
    }

    $("reportForm").reset();

    photoData = "";
    $("photo").value = "";

    selectedMapSector = "";

    renderAll();
    showTab("barriers");

    notify("Demanda registrada! A comunidade já pode apoiá-la.");
  }

  // REGISTRAR NECESSIDADE DE PROFISSIONAL
  function createSupport(event) {
    event.preventDefault();

    if (!user || user.isAdmin) {
      notify("Entre como participante para registrar uma necessidade.");
      return;
    }

    state.supports.unshift({
      id: makeId("support"),
      createdAt: Date.now(),
      date: nowLabel(),
      userId: user.id,
      author: user.name,
      anonymous: $("anonymousSupport").checked,
      professional: $("professional").value,
      shift: $("shift").value,
      classroom: $("supportClass").value.trim(),
      level: $("needLevel").value,
      description: $("supportDesc").value.trim()
    });

    if (!saveState()) {
      state.supports.shift();
      return;
    }

    $("supportForm").reset();

    renderSupports();

    notify("Necessidade profissional registrada!");
  }

  // GERAR OFÍCIO / ABAIXO-ASSINADO
  function generateDocument() {
    const school = user?.school || "________________________________";

    const lines = [...state.reports]
      .sort((a, b) => (b.votedBy?.length || 0) - (a.votedBy?.length || 0))
      .slice(0, 10)
      .map((report, index) =>
        `${index + 1}. ${report.kind} — ${report.sector}.\n${report.description}\nApoios: ${report.votedBy?.length || 0}.\nSituação: ${report.status}.`
      )
      .join("\n\n");

    const supportLines = state.supports
      .slice(0, 8)
      .map((item, index) =>
        `${index + 1}. ${item.professional} — turno ${item.shift}; turma: ${item.classroom || "não informada"}; necessidade: ${item.level}.`
      )
      .join("\n");

    $("documentText").value = `À Direção da Escola / Secretaria de Educação

ASSUNTO: Solicitação de providências para promoção da acessibilidade e da educação inclusiva.

À autoridade responsável,

Nós, integrantes da comunidade escolar de ${school}, solicitamos a análise e adoção de providências para eliminar barreiras de acessibilidade e garantir condições adequadas de participação, permanência e aprendizagem a todos os estudantes.

DEMANDAS DE ACESSIBILIDADE:
${lines || "Ainda não há demandas registradas."}

NECESSIDADES DE PROFISSIONAIS DE APOIO:
${supportLines || "Ainda não há necessidades profissionais registradas."}

Solicitamos:
1. Avaliação técnica das barreiras físicas e comunicacionais identificadas;
2. Planejamento e execução das adequações de acessibilidade necessárias;
3. Avaliação da necessidade de profissionais e recursos de apoio;
4. Apresentação de cronograma de providências e retorno à comunidade escolar;
5. Transparência no acompanhamento das medidas adotadas.

Fundamentação: Constituição Federal de 1988, Convenção sobre os Direitos das Pessoas com Deficiência, Lei Brasileira de Inclusão (Lei nº 13.146/2015) e legislação educacional aplicável.

Local e data: __________________________________

Assinaturas dos representantes da comunidade escolar:

Nome: __________________________ Assinatura: __________________________

Nome: __________________________ Assinatura: __________________________

Nome: __________________________ Assinatura: __________________________

Atenciosamente,

Comunidade Escolar — Escola Para Todos`;

    $("docModal").classList.add("show");
    $("docModal").setAttribute("aria-hidden", "false");
    $("closeModal").focus();
  }

  // CADASTRO DE PARTICIPANTE
  $("registerForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = $("registerName").value.trim();
    const profile = $("registerProfile").value;
    const school = $("registerSchool").value.trim();

    // TURMA E TURNO SÃO SALVOS SOMENTE PARA ALUNOS
    const classroom = profile === "Aluno"
      ? $("registerClass").value.trim()
      : "";

    const shift = profile === "Aluno"
      ? $("registerShift").value
      : "";

    const password = $("registerPassword").value;
    const confirmPassword = $("registerPassword2").value;

    if (password.length < 4) {
      return setEntryMessage("A senha precisa ter pelo menos 4 caracteres.");
    }

    if (password !== confirmPassword) {
      return setEntryMessage("As senhas não coincidem.");
    }

    if (state.users.some(account => normalize(account.name) === normalize(name))) {
      return setEntryMessage("Já existe uma conta com esse nome neste navegador. Entre pela aba Entrar.");
    }

    const account = {
      id: makeId("user"),
      name,
      profile,
      school,
      classroom,
      shift,
      passwordHash: demoPasswordHash(password),
      isAdmin: false,
      createdAt: Date.now()
    };

    state.users.push(account);

    if (!saveState()) {
      state.users.pop();
      return;
    }

    $("registerForm").reset();

    setEntryMessage("Cadastro criado com sucesso!", false);

    enterApp(account);
  });

  // LOGIN DE PARTICIPANTE
  $("loginForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = normalize($("loginName").value);
    const passwordHash = demoPasswordHash($("loginPassword").value);

    const account = state.users.find(
      item => normalize(item.name) === name &&
        item.passwordHash === passwordHash
    );

    if (!account) {
      return setEntryMessage("Nome ou senha incorretos. Confira os dados ou crie um cadastro.");
    }

    enterApp(account);
  });

  // LOGIN ADMINISTRATIVO DE DEMONSTRAÇÃO
  $("adminLoginForm").addEventListener("submit", event => {
    event.preventDefault();

    if ($("adminCode").value !== ADMIN_DEMO_CODE) {
      return setEntryMessage("Código de administrador incorreto.");
    }

    const admin = {
      id: "demo-admin-local",
      name: "Administrador",
      profile: "Administrador",
      school: "",
      classroom: "",
      isAdmin: true
    };

    enterApp(admin);

    $("adminLoginForm").reset();

    notify("Modo administrador demonstrativo ativado.");
  });

  // EVENTOS DOS CAMPOS DE CADASTRO E PERFIL
  $("showRegister").addEventListener("click", () => switchEntry("register"));
  $("showLogin").addEventListener("click", () => switchEntry("login"));

  $("registerProfile").addEventListener("change", syncStudentFields);
  $("profileRoleEdit").addEventListener("change", syncProfileStudentFields);

  syncStudentFields();

  $("logout").addEventListener("click", leaveApp);

  // NAVEGAÇÃO
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => showTab(button.dataset.goto));
  });

  // FORMULÁRIOS
  $("reportForm").addEventListener("submit", createReport);
  $("supportForm").addEventListener("submit", createSupport);

  // ENVIO E COMPRESSÃO DE FOTOS
  $("photo").addEventListener("change", async event => {
    const file = event.target.files?.[0];

    photoData = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      notify("Escolha um arquivo de imagem.");
      event.target.value = "";
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      notify("Escolha uma imagem de até 8 MB antes da compressão.");
      event.target.value = "";
      return;
    }

    try {
      photoData = await compressImage(file);
      notify("Imagem adicionada e otimizada.");
    } catch (error) {
      event.target.value = "";
      notify(error.message || "Não foi possível adicionar a imagem.");
    }
  });

  // SALVAR ALTERAÇÕES DO PERFIL
  $("profileForm").addEventListener("submit", event => {
    event.preventDefault();

    if (!user || user.isAdmin) return;

    user.name = $("profileNameEdit").value.trim();
    user.profile = $("profileRoleEdit").value;
    user.school = $("profileSchoolEdit").value.trim();

    // TURMA E TURNO SÓ SÃO MANTIDOS QUANDO O PERFIL É ALUNO
    user.classroom = user.profile === "Aluno"
      ? $("profileClassEdit").value.trim()
      : "";

    user.shift = user.profile === "Aluno"
      ? $("profileShiftEdit").value
      : "";

    // Atualiza o nome exibido nos relatos não anônimos da própria conta.
    state.reports.forEach(report => {
      if (report.userId === user.id && !report.anonymous) {
        report.author = user.name;
      }
    });

    state.supports.forEach(item => {
      if (item.userId === user.id && !item.anonymous) {
        item.author = user.name;
      }
    });

    $("who").textContent = `${user.name} · ${user.profile}`;
    $("schoolLabel").textContent = `Comunidade: ${user.school}`;

    saveState();

    populateProfile();
    renderAll();

    notify("Perfil atualizado com sucesso.");
  });

  // BUSCA E FILTROS DE RELATOS
  $("searchReports").addEventListener("input", () => {
    renderReports("allDemands");
  });

  $("sortReports").addEventListener("change", () => {
    renderReports("allDemands");
  });

  $("filterSector").addEventListener("change", () => {
    selectedMapSector = "";
    renderMapCounts();
    renderReports("allDemands");
  });

  $("filterStatus").addEventListener("change", () => {
    renderReports("allDemands");
  });

  // FILTRO PELO MAPA ESQUEMÁTICO
  document.querySelectorAll("[data-map-sector]").forEach(button => {
    button.addEventListener("click", () => {
      selectedMapSector = button.dataset.mapSector || "";

      $("filterSector").value = selectedMapSector;

      renderMapCounts();
      renderReports("allDemands");
    });
  });

  // MODAL DE DOCUMENTO
  $("generate").addEventListener("click", generateDocument);

  $("closeModal").addEventListener("click", () => {
    $("docModal").classList.remove("show");
    $("docModal").setAttribute("aria-hidden", "true");
  });

  $("docModal").addEventListener("click", event => {
    if (event.target === $("docModal")) {
      $("docModal").classList.remove("show");
      $("docModal").setAttribute("aria-hidden", "true");
    }
  });

  $("printDoc").addEventListener("click", () => {
    window.print();
  });

  $("copyDoc").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("documentText").value);
      notify("Documento copiado!");
    } catch (error) {
      $("documentText").focus();
      $("documentText").select();
      notify("Selecione o texto e use Ctrl+C para copiar.");
    }
  });

  // FERRAMENTAS DE ACESSIBILIDADE
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      if (action === "fontUp") {
        fontSize = Math.min(24, fontSize + 2);
      }

      if (action === "fontDown") {
        fontSize = Math.max(12, fontSize - 2);
      }

      if (action === "fontReset") {
        fontSize = 16;
      }

      document.documentElement.style.fontSize = `${fontSize}px`;

      const className = {
        contrast: "contrast",
        gray: "gray",
        spacing: "spaced"
      }[action];

      if (className) {
        document.body.classList.toggle(className);

        button.setAttribute(
          "aria-pressed",
          String(document.body.classList.contains(className))
        );
      }
    });
  });

  // INICIALIZAÇÃO: NENHUM DADO FICTÍCIO É CRIADO.
  // A LISTA COMEÇA VAZIA.
  loadState();

  if (user) {
    enterApp(user);
  } else {
    switchEntry("register");
  }
})();