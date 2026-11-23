# IBAMA 2025 — metodologia

Dados oficiais do IBAMA, Autos de Infração. Camadas administrativas separadas dos eventos OSINT em events.json. O GitHub Pages gera public/data/ibama-2025.json durante o deploy, a partir do ZIP anual com CSV de 2025.

Recorte: autos lavrados em 2025 nas UFs da Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR, TO). Não há recorte pelo polígono exato do bioma Amazônia: partes de MA, MT e TO ficam fora do bioma. Coordenadas ausentes são excluídas do mapa, sem substituição pelo centroide municipal. Autos cancelados, excluídos ou substituídos não são apresentados. Duplicatas são deduplicadas pelo identificador oficial. Os campos pessoais do infrator, CPF/CNPJ e descrições narrativas detalhadas não são exportados. Auto de infração é ato administrativo, não sentença penal. Classificações temáticas derivadas destinam-se à visualização, preservando o tipo oficial.

Fonte: https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao
