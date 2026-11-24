(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  let user = null;
  let reports = [];
  let supports = [];
  let voted = new Set();
  let fontSize = 16;
  let photoData = "";

  // PROTEÇÃO DE TEXTO HTML
  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  // SALVAR DADOS NO SQLITE PELO SERVIDOR
  let saveQueue = Promise.resolve();

  function save() {
    const payload = { reports, supports, voted: [...voted], user };

    saveQueue = saveQueue.then(() => fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })).then(response => {
      if (!response.ok) throw new Error("Falha ao salvar no SQLite");
    }).catch(error => {
      console.error("Erro ao salvar:", error);
      alert("Não foi possível salvar. Verifique se o servidor Python está aberto.");
    });

    return saveQueue;
  }

  // CARREGAR DADOS DO SQLITE
  async function load() {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha ao carregar");

      const data = await response.json();

      reports = data.reports || [];
      supports = data.supports || [];
      voted = new Set(data.voted || []);
      user = data.user || null;

    } catch (error) {
      console.error("Erro ao conectar ao banco:", error);
      alert("Não consegui conectar ao banco. Verifique se server.py está rodando.");
      reports = [];
      supports = [];
      voted = new Set();
      user = null;
    }

    // DEMANDAS DE EXEMPLO
    if (!reports.length) {
      reports = [
        {
          id: 1,
          sector: "Entrada",
          kind: "Falta de rampa",
          description: "A entrada principal possui degraus e não oferece uma rota acessível para pessoas que utilizam cadeira de rodas.",
          place: "Entrada principal",
          status: "Reportado",
          votes: 12,
          author: "Participante da comunidade",
          history: [{ status: "Reportado", date: "Registro inicial" }]
        },
        {
          id: 2,
          sector: "Banheiros",
          kind: "Banheiro não adaptado",
          description: "O banheiro não possui barras de apoio e espaço adequado para manobra de cadeira de rodas.",
          place: "Bloco A",
          status: "Em andamento",
          votes: 9,
          author: "Participante da comunidade",
          history: [
            { status: "Reportado", date: "Registro inicial" },
            { status: "Em andamento", date: "Atualização demonstrativa" }
          ]
        },
        {
          id: 3,
          sector: "Salas de aula",
          kind: "Ausência de piso tátil",
          description: "Falta sinalização tátil para orientar a circulação de pessoas com deficiência visual.",
          place: "Corredor do 1º andar",
          status: "Reportado",
          votes: 7,
          author: "Participante da comunidade",
          history: [{ status: "Reportado", date: "Registro inicial" }]
        }
      ];

      supports = [
        {
          id: 1,
          professional: "Intérprete de Libras",
          shift: "Manhã",
          classroom: "8º ano A",
          level: "Urgente",
          description: "Necessidade de apoio à comunicação nas aulas."
        },
        {
          id: 2,
          professional: "Auxiliar de sala",
          shift: "Tarde",
          classroom: "6º ano B",
          level: "Alta",
          description: "Demanda de apoio para participação nas atividades."
        }
      ];

      await save();
    }
  }

  // ENTRADA NO SITE
  function enter() {
    user = {
      name: $("userName").value.trim(),
      profile: $("profile").value,
      school: $("school").value.trim(),
      classroom: $("classroom").value.trim(),
      anonymous: false
    };

    if (!user.name || !user.profile || !user.school || !user.classroom) {
      alert("Preencha todos os campos para continuar.");
      return;
    }

    $("entry").hidden = true;
    $("accessBar").hidden = false;
    $("app").hidden = false;

    $("who").textContent = `${user.name} · ${user.profile}`;
    $("schoolLabel").textContent = `Comunidade: ${user.school}`;

    show("home");
    save();
    render();
  }

  // NAVEGAÇÃO
  function show(tab) {
    document.querySelectorAll(".section").forEach(section => {
      section.classList.toggle("active", section.id === tab);
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });

    if (tab === "barriers") renderReports("allDemands");
    if (tab === "home") renderReports("homeDemands");
    if (tab === "professionals") renderSupports();
    if (tab === "profile") populateProfile();

    const section = $(tab);
    if (section) {
      section.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    }
  }

  // CORES DOS STATUS
  function statusClass(status) {
    return status === "Resolvido"
      ? "resolved"
      : status === "Em andamento"
      ? "progress"
      : "reported";
  }

  // MONTAR CARTÃO DE DEMANDA
  function demandCard(report) {
    const photo = report.photo ? `
      <img
        class="photo"
        src="${report.photo}"
        alt="${escapeHTML(report.alt || "Fotografia da barreira registrada")}"
      >
    ` : "";

    let statusEditor = "";

    if (user && !user.anonymous) {
      statusEditor = `
        <div class="status-editor">
          <label for="status${report.id}">
            Atualizar status (demonstração)
          </label>
          <select data-status="${report.id}" id="status${report.id}">
            <option ${report.status === "Reportado" ? "selected" : ""}>Reportado</option>
            <option ${report.status === "Em andamento" ? "selected" : ""}>Em andamento</option>
            <option ${report.status === "Resolvido" ? "selected" : ""}>Resolvido</option>
          </select>
        </div>
      `;
    }

    return `
      <article class="demand">
        <div class="demandhead">
          <div>
            <h3>${escapeHTML(report.kind)}</h3>
            <span class="small muted">
              ${escapeHTML(report.sector)} ·
              ${escapeHTML(report.place || "Local não informado")}
            </span>
          </div>
          <span class="tag ${statusClass(report.status)}">
            ${escapeHTML(report.status)}
          </span>
        </div>

        <p>${escapeHTML(report.description)}</p>
        ${photo}

        <div class="meta">
          Relato de ${escapeHTML(report.author || "Participante")}
          · Demanda #${report.id}
        </div>

        <div class="vote">
          <span>💚 <strong>${report.votes}</strong> apoio(s)</span>
          <button class="btn secondary" data-vote="${report.id}"
            ${voted.has(report.id) ? "disabled" : ""}>
            ${voted.has(report.id) ? "✓ Apoiando" : "♡ Apoiar demanda"}
          </button>
        </div>

        ${statusEditor}

        <div class="timeline">
          <div class="timeline-title">Linha do tempo</div>
          ${(report.history || [{status: report.status, date: "Status atual"}])
            .slice(-3)
            .map(item => `
              <div class="timeline-item">
                <span class="timeline-bullet">●</span>
                <span>${escapeHTML(item.status)} · ${escapeHTML(item.date || "Atualização")}</span>
              </div>
            `).join("")}
        </div>
      </article>
    `;
  }
    // MOSTRAR DEMANDAS
  function renderReports(target) {
    let list = [...reports];

    const sortMode = $("sortReports")?.value || "votes";
    const priorityRank = {
      "Reportado": 0,
      "Em andamento": 1,
      "Resolvido": 2
    };

    if (sortMode === "priority") {
      list.sort((a, b) =>
        priorityRank[a.status] - priorityRank[b.status] ||
        b.votes - a.votes
      );
    } else if (sortMode === "recent") {
      list.sort((a, b) => Number(b.id) - Number(a.id));
    } else {
      list.sort((a, b) => b.votes - a.votes);
    }

    const query = ($("searchReports")?.value || "").trim().toLowerCase();

    if (query) {
      list = list.filter(r =>
        [r.kind, r.sector, r.description, r.place]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }

    if (target === "myReports" && user) {
      list = list.filter(report => report.author === user.name);
    }

    if (target === "allDemands") {
      if ($("filterSector").value) {
        list = list.filter(report =>
          report.sector === $("filterSector").value
        );
      }

      if ($("filterStatus").value) {
        list = list.filter(report =>
          report.status === $("filterStatus").value
        );
      }
    }

    $(target).innerHTML = list.length
      ? list.map(demandCard).join("")
      : `
        <div class="empty">
          Nenhuma demanda encontrada.
          Que tal registrar a primeira?
        </div>
      `;

    // BOTÃO DE APOIO
    $(target).querySelectorAll("[data-vote]").forEach(button => {
      button.addEventListener("click", async () => {
        const report = reports.find(
          item => item.id === Number(button.dataset.vote)
        );

        if (report && !voted.has(report.id)) {
          report.votes++;
          voted.add(report.id);
          await save();
          render();
        }
      });
    });

    // ATUALIZAR STATUS
    $(target).querySelectorAll("[data-status]").forEach(select => {
      select.addEventListener("change", async () => {
        const report = reports.find(
          item => item.id === Number(select.dataset.status)
        );

        if (report) {
          const previous = report.status;
          report.status = select.value;
          report.history = report.history || [];

          if (previous !== report.status) {
            report.history.push({
              status: report.status,
              date: new Date().toLocaleString("pt-BR")
            });
          }

          await save();
          render();
        }
      });
    });
  }

  // MOSTRAR NECESSIDADES PROFISSIONAIS
  function renderSupports() {
    const sorted = [...supports].sort((a, b) => {
      const priority = {
        Urgente: 0,
        Alta: 1,
        Moderada: 2
      };
      return priority[a.level] - priority[b.level];
    });

    $("supportList").innerHTML = sorted.length
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
              }">
                ${escapeHTML(item.level)}
              </span>
            </div>

            <p>
              Turno: <strong>${escapeHTML(item.shift)}</strong>
              · Turma: ${escapeHTML(item.classroom || "Não informada")}
            </p>

            <p>
              ${escapeHTML(
                item.description ||
                "Necessidade registrada pela comunidade escolar."
              )}
            </p>
          </article>
        `).join("")
      : `
        <div class="empty">
          Ainda não há necessidades registradas.
        </div>
      `;
  }

  // PERFIL DO PARTICIPANTE
  function populateProfile() {
    if (!user) return;

    $("profileNameEdit").value = user.name || "";
    $("profileRoleEdit").value = user.profile || "Aluno";
    $("profileSchoolEdit").value = user.school || "";
    $("profileClassEdit").value = user.classroom || "";

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

    $("profileSummary").innerHTML = `
      <div>
        <span class="profile-detail-label">Escola</span>
        <strong>${escapeHTML(user.school || "Não informada")}</strong>
      </div>
      <div>
        <span class="profile-detail-label">Turma/turno</span>
        <strong>${escapeHTML(user.classroom || "Não informado")}</strong>
      </div>
    `;

    renderReports("myReports");
  }

  // EDITAR PERFIL
  $("profileForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!user) return;

    const oldName = user.name;

    user.name = $("profileNameEdit").value.trim();
    user.profile = $("profileRoleEdit").value;
    user.school = $("profileSchoolEdit").value.trim();
    user.classroom = $("profileClassEdit").value.trim();

    reports.forEach(report => {
      if (report.author === oldName) {
        report.author = user.name;
      }
    });

    $("who").textContent = `${user.name} · ${user.profile}`;
    $("schoolLabel").textContent = `Comunidade: ${user.school}`;

    populateProfile();
    await save();

    alert("Perfil atualizado!");
    render();
  });

  // ATUALIZAR PAINEL
  function render() {
    renderReports("homeDemands");
    renderReports("allDemands");
    renderSupports();

    $("total").textContent = reports.length;

    $("votes").textContent = reports.reduce(
      (sum, item) => sum + item.votes,
      0
    );

    $("working").textContent = reports.filter(
      item => item.status === "Em andamento"
    ).length;

    $("done").textContent = reports.filter(
      item => item.status === "Resolvido"
    ).length;
  }

  // EVENTOS DE ENTRADA
  $("registerForm").addEventListener("submit", event => {
    event.preventDefault();
    enter();
  });

  // SAIR E VOLTAR PARA O CADASTRO
  $("logout").addEventListener("click", () => {
    user = null;

    $("app").hidden = true;
    $("accessBar").hidden = true;
    $("entry").hidden = false;

    $("registerForm").reset();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });

  // EVENTOS DE NAVEGAÇÃO
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      show(button.dataset.tab);
    });
  });

  document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => {
      show(button.dataset.goto);
    });
  });

  // FILTROS
  $("filterSector").addEventListener("change", () => {
    renderReports("allDemands");
  });

  $("filterStatus").addEventListener("change", () => {
    renderReports("allDemands");
  });

  $("searchReports")?.addEventListener("input", () => {
    renderReports("allDemands");
  });

  $("sortReports")?.addEventListener("change", () => {
    renderReports("allDemands");
  });
    // ENVIO DE FOTOGRAFIA
  $("photo").addEventListener("change", event => {
    const file = event.target.files[0];
    photoData = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Escolha um arquivo de imagem.");
      event.target.value = "";
      return;
    }

    if (file.size > 900000) {
      alert("Para este protótipo, escolha uma imagem de até 900 KB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      photoData = reader.result;
    };

    reader.readAsDataURL(file);
  });

  // REGISTRAR BARREIRA
  $("reportForm").addEventListener("submit", async event => {
    event.preventDefault();

    reports.push({
      id: Date.now(),
      sector: $("sector").value,
      kind: $("kind").value,
      description: $("description").value.trim(),
      place: $("locationDetail").value.trim(),

      history: [{
        status: "Reportado",
        date: new Date().toLocaleString("pt-BR")
      }],

      alt: $("altText").value.trim(),
      photo: photoData,
      status: "Reportado",
      votes: 0,

      author: user.anonymous
        ? "Participante anônimo"
        : user.name
    });

    await save();

    event.target.reset();
    photoData = "";

    render();
    show("barriers");

    alert("Demanda registrada! A comunidade já pode apoiá-la.");
  });

  // REGISTRAR NECESSIDADE PROFISSIONAL
  $("supportForm").addEventListener("submit", async event => {
    event.preventDefault();

    supports.push({
      id: Date.now(),
      professional: $("professional").value,
      shift: $("shift").value,
      classroom: $("supportClass").value,
      level: $("needLevel").value,
      description: $("supportDesc").value
    });

    await save();

    event.target.reset();
    renderSupports();

    alert("Necessidade profissional registrada!");
  });

  // GERAR OFÍCIO / ABAIXO-ASSINADO
  $("generate").addEventListener("click", () => {
    const school = user?.school ||
      "________________________________";

    const lines = [...reports]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 10)
      .map((report, index) => `
${index + 1}. ${report.kind} — ${report.sector}.
${report.description}
Apoios: ${report.votes}.
Situação: ${report.status}.
        `)
      .join("\n");

    $("documentText").value = `
À Direção da Escola / Secretaria de Educação

ASSUNTO: Solicitação de providências para promoção da acessibilidade e da educação inclusiva.

À autoridade responsável,

Nós, integrantes da comunidade escolar de ${school}, solicitamos a análise e adoção de providências para eliminar barreiras de acessibilidade e garantir condições adequadas de participação, permanência e aprendizagem a todos os estudantes.

DEMANDAS PRIORITÁRIAS:

${lines || "Ainda não há demandas registradas."}

Solicitamos:

1. Avaliação técnica das barreiras físicas identificadas;

2. Planejamento e execução das adequações de acessibilidade necessárias;

3. Avaliação da necessidade de profissionais de apoio, incluindo intérpretes de Libras, cuidadores, auxiliares de sala e psicopedagogos;

4. Apresentação de cronograma de providências e retorno à comunidade escolar;

5. Transparência no acompanhamento das medidas adotadas.

Fundamentação: Constituição Federal de 1988, Convenção sobre os Direitos das Pessoas com Deficiência, Lei Brasileira de Inclusão (Lei nº 13.146/2015) e legislação educacional aplicável.

Local e data: __________________________________

Assinaturas dos representantes da comunidade escolar:

Nome: __________________________ Assinatura: __________________________

Nome: __________________________ Assinatura: __________________________

Nome: __________________________ Assinatura: __________________________

Atenciosamente,

Comunidade Escolar — Escola Para Todos
    `;

    $("docModal").classList.add("show");
    $("closeModal").focus();
  });

  // FECHAR DOCUMENTO
  $("closeModal").addEventListener("click", () => {
    $("docModal").classList.remove("show");
  });

  // IMPRIMIR DOCUMENTO
  $("printDoc").addEventListener("click", () => {
    window.print();
  });

  // COPIAR DOCUMENTO
  $("copyDoc").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        $("documentText").value
      );

      alert("Documento copiado!");

    } catch (error) {
      $("documentText").select();
      alert("Selecione e copie o texto.");
    }
  });

  // ACESSIBILIDADE
  document.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      // AUMENTAR FONTE
      if (action === "fontUp") {
        fontSize = Math.min(24, fontSize + 2);
      }

      // DIMINUIR FONTE
      if (action === "fontDown") {
        fontSize = Math.max(12, fontSize - 2);
      }

      // RESTAURAR FONTE
      if (action === "fontReset") {
        fontSize = 16;
      }

      document.documentElement.style.fontSize =
        `${fontSize}px`;

      // MODOS DE ACESSIBILIDADE
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

  // INICIALIZAÇÃO: CARREGAR DO SQLITE
  load().then(() => render());

})();