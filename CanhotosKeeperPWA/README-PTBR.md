# Canhotos Keeper (PWA — 100% front-end)
Organize fotos de **canhotos** automaticamente por **Loja**, **Data** e **Número**. O app roda **direto no navegador** (computador ou celular), salva tudo localmente (IndexedDB) e usa **OCR com Tesseract.js** para reconhecer números nas imagens.

> **Importante:** O OCR carrega a biblioteca Tesseract.js via CDN. Para reconhecer texto, o dispositivo precisa de internet. O restante do app (busca, visualização, dados) funciona offline depois de instalado como PWA.

## Como usar (sem terminal)
1. **Baixe o ZIP** e extraia a pasta.
2. Abra o arquivo `index.html` no navegador **ou** publique a pasta inteira em um host estático:
   - **Vercel** → New Project → *Import Project* → *Upload* → selecione a **pasta inteira** → Deploy.
   - **Netlify** → *Deploy site* → *Deploy manually* → arraste a **pasta inteira**.
3. Abra o site no celular/desktop e:
   - Vá em **Adicionar** → selecione/tire fotos → (opcional) informe **Loja** e **Data** → marque "Usar OCR" → **Processar e Salvar**.
   - Use **Buscar** para achar por **Número** + (opcional) **Data**.
   - Use **Navegar** para ver todos de uma **Data** (e opcionalmente filtrar por **Loja**).
   - Faça **Backup** (exporta JSON com imagens) e **Importe** quando quiser restaurar.

## Como o OCR entende os dados
- **Número do canhoto**: procura uma sequência de **5 a 10 dígitos** no texto reconhecido (ex.: `115310`).
- **Data**: aceita formatos como `dd/mm/aaaa`, `dd.mm.aaaa`, `dd-mm-aaaa`, `mm.dd.aaaa` e `aaaa-mm-dd`. Quando ambíguo, prioriza padrão BR (dia primeiro).
- **Loja**: detecta padrões como `loja 5`. Você pode informar manualmente para mais precisão.

## “Pastas” (organização)
Os arquivos são guardados no navegador, mas o app mostra o caminho virtual no formato:
```
LOJA/AAAA-MM-DD/NUMERO
```
Isso ajuda a visualizar a organização. Você pode buscar por data/loja e abrir as fotos.

## Observações
- Este pacote evita servidor/backend para **zerar** a necessidade de configuração. Se você preferir guardar no **servidor** (Render, Railway, etc.) com login/backup em nuvem, posso te enviar uma versão Node/Express + banco e painel, já integrada ao front.
- Reconhecimento funciona melhor com fotos nítidas (sem sombra/corte), número grande, fonte impressa. Fotos inclinadas/escuro podem reduzir a precisão — você pode corrigir depois manualmente (editando os campos não está implementado nesta versão; posso adicionar no próximo passo).

## Personalizações rápidas
- Cores/tema: edite `assets/styles.css`.
- Regras do OCR/parsers: edite `assets/app.js` (funções `sanitizeNumber`, `parseDateAny`, `parseStore`).

## Suporte
Qualquer coisa, me chame que ajusto:
- Edição de registros (corrigir Nº/Loja/Data);
- Exportar para **ZIP** por data/loja;
- Envio automático para Google Drive/Dropbox;
- Versão com **login** e **sincronização** multi-dispositivo.
