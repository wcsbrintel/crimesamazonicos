# IBAMA 2020–2025 — ingestão oficial, classificação e evidências

A seção **Dados Oficiais / IBAMA** não altera `data/events.json`. Trata de **autos de infração administrativos**, não condenações criminais. Os arquivos anuais `public/data/ibama-2020.json` até `public/data/ibama-2025.json` são gerados na publicação GitHub Pages. O seletor inicia em **2025**, com opção de navegar entre os seis anos sem mesclar autos de anos diferentes.

## Fontes utilizadas

1. [IBAMA — auto de infração](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao): 2020–2025, data de lavratura, enquadramentos, texto original usado **somente para classificação**, operação, processo, área afetada e bioma. O campo `DES_AUTO_INFRACAO` é apresentado como **Detalhamento** após filtragem de identificadores pessoais diretos (sem inventar espécies ou quantidades). O texto pode conter dados não padronizados; a publicação é em português original, com rótulos localizados.
2. [IBAMA — auto de infração, espécime](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao): nomes científicos/populares, quantidade e unidade, ligados por `SEQ_AUTO_INFRACAO`. Estes itens são **espécimes registrados no auto** e não são rotulados como apreendidos sem evidência complementar.
3. [IBAMA — termos de apreensão](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-termo-de-apreensao): vínculo direto com auto por `SEQ_AUTO_INFRACAO` e com itens por `SEQ_TAD`.
   - O campo `DS_TAD` aparece como **Detalhamento da apreensão** somente nos termos vinculados ao auto por `SEQ_AUTO_INFRACAO`; a chave `SEQ_TAD` associa os bens e espécimes. Narrativas são distinguíveis das quantidades estruturadas e passam por mascaramento de identificadores diretos.
4. Espécimes apreendidos / bens apreendidos: vinculados ao termo por `SEQ_TAD`. Apenas estes itens são apresentados como efetivamente apreendidos.

Não são utilizados vínculos aproximados por município, coordenada, nome de operação ou data. Nomes de infratores, CPF/CNPJ, placas, números de chassis e dados pessoais não são publicados.

## Recorte e limitações

- Datas de **lavratura dos autos de 2020 a 2025**, com um arquivo por ano, e recorte por ano baseado no ano da lavratura, não no ano de publicação do portal.
- UFs da Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR e TO), **não** recorte exato do bioma Amazônia.
- Exclusão de autos cancelados e de registros sem coordenadas adequadas.
- Um mesmo auto pode aparecer em **mais de uma categoria** quando há evidência explícita na descrição/enquadramento; por isso, as contagens das categorias não devem ser somadas como total de autos únicos.
- Classificações como mineração, desmatamento, madeira e poluição utilizam indicadores explícitos registrados nos dados do IBAMA; não representam tipificação penal nem comprovação de envolvimento com crime organizado.
- Os campos complementares têm cobertura variável. A ausência de espécies, quantidades ou bens é apresentada como **não informada**; nunca é inferida.
- **As datas das apreensões** são as datas dos termos vinculados; não são confundidas com a data de lavratura do auto ou com a data do fato.
- Muitos pontos têm coordenadas repetidas. Apenas **localizações geográficas numericamente idênticas** compartilham marcador e permitem selecionar um auto individual.

## Auditoria

A cada construção do site, o pipeline executa `build-ibama-years.py` (uma transferência do ZIP oficial anual) e `enrich-ibama-years.py` (uma passagem por cada recurso complementar). São gerados seis arquivos de auditoria `ibama-ANO-audit.json`, com contagens por ano e cobertura das fontes, sem unir espécies ou apreensões por proximidade geográfica. A publicação exige a existência e a integridade de cada ano (2020–2025).
