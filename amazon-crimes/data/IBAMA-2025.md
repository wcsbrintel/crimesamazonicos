# IBAMA 2025 — ingestão oficial, classificação e evidências

A seção **IBAMA · 2025** não altera `data/events.json`. Trata de **autos de infração administrativos**, não condenações criminais. O arquivo `public/data/ibama-2025.json` é gerado durante a publicação GitHub Pages.

## Fontes utilizadas

1. [IBAMA — auto de infração](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao): 2025, data de lavratura, enquadramentos, texto original usado **somente para classificação**, operação, processo, área afetada e bioma. A descrição narrativa integral não é exposta publicamente por razões de privacidade.
2. [IBAMA — auto de infração, espécime](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao): nomes científicos/populares, quantidade e unidade, ligados por `SEQ_AUTO_INFRACAO`. Estes itens são **espécimes registrados no auto** e não são rotulados como apreendidos sem evidência complementar.
3. [IBAMA — termos de apreensão](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-termo-de-apreensao): vínculo direto com auto por `SEQ_AUTO_INFRACAO` e com itens por `SEQ_TAD`.
4. Espécimes apreendidos / bens apreendidos: vinculados ao termo por `SEQ_TAD`. Apenas estes itens são apresentados como efetivamente apreendidos.

Não são utilizados vínculos aproximados por município, coordenada, nome de operação ou data. Nomes de infratores, CPF/CNPJ, placas, números de chassis e dados pessoais não são publicados.

## Recorte e limitações

- Datas de **lavratura dos autos em 2025**.
- UFs da Amazônia Legal (AC, AM, AP, MA, MT, PA, RO, RR e TO), **não** recorte exato do bioma Amazônia.
- Exclusão de autos cancelados e de registros sem coordenadas adequadas.
- Um mesmo auto pode aparecer em **mais de uma categoria** quando há evidência explícita na descrição/enquadramento; por isso, as contagens das categorias não devem ser somadas como total de autos únicos.
- Classificações como mineração, desmatamento, madeira e poluição utilizam indicadores explícitos registrados nos dados do IBAMA; não representam tipificação penal nem comprovação de envolvimento com crime organizado.
- Os campos complementares têm cobertura variável. A ausência de espécies, quantidades ou bens é apresentada como **não informada**; nunca é inferida.
- **As datas das apreensões** são as datas dos termos vinculados; não são confundidas com a data de lavratura do auto ou com a data do fato.
- Muitos pontos têm coordenadas repetidas. Apenas **localizações geográficas numericamente idênticas** compartilham marcador e permitem selecionar um auto individual.

## Auditoria

A cada construção do site, o pipeline executa `build-ibama-2025.py`, depois `enrich-ibama-2025.py`. É gerado `public/data/ibama-2025-audit.json`, contendo contagens de classificações, vínculos de espécies/apreensões, cobertura de recursos e possíveis erros de ingestão, sem dados pessoais.
