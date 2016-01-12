/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

'use strict';

import * as marked from 'marked';
import * as highlight from 'highlight.js';
import {AllHtmlEntities as entities} from 'html-entities';

/**
 * Renders marked's markdown AST back out as markdown, making a markdown
 * to markdown compiler.
 *
 * Why do such a ridiculous thing?
 *
 * So that we can automatically detect the language of code snippets and
 * add it to our readmes.
 *
 * Besides that it tries to make as few changes to the input markdown as
 * possible.
 */
class MarkdownMarkdownRenderer {

  code(code:string, lang:string, escaped:boolean) {
    // These lines are the reason for this entire file!
    // Here we automatically detect the language for the given code snippet
    // and inject it into the output markdown.
    if (!lang) {
      lang = highlight.highlightAuto(
          code, ['html', 'css', 'javascript']).language;
    }
    if (escaped) {
      code = entities.decode(code);
    }
    return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  }

  blockquote(quote:string) {
    return `> ${quote}`;
  }

  html(html:string) {
    return html;
  }

  heading(text: string, level: number, raw:string) {
    var prefix = '';
    for (var i = 0; i < level; i++) {
      prefix += '#';
    }
    return `${prefix} ${raw}\n\n`;
  }

  hr() {
    return '---\n\n';
  }

  list(body:string, ordered:boolean) {
    if (ordered) {
      body = body.replace(/(^|\n)\*/g, '$11.');
    }
    // Note: as written this flattens nested lists. To restore them, we'd need
    // to inject beginning and ending markers as HTML comments to the output
    // here, then look for them inside of `body` and apply appropriate
    // indentation. I'm hoping that we can get by without supporting them.
    return `${body}\n`;
  }

  listitem(text:string) {
    return `* ${text}\n`;
  }

  paragraph(text:string) {
    return `${text}\n\n`;
  }

  table(header:string, body:string) {
    return `${header}\n${body}\n`;
  }

  tablerow(content:string) {
    const isHeader = /😿TH😿/.test(content);
    content = content.replace(/😿TH😿/g, '');
    const columns = content.slice(0, -1).split('|');
    const result = `| ${columns.join(' | ')} |\n`;
    if (isHeader) {
      const headerSeparator = `|${' --- |'.repeat(columns.length)}`;
      return result + headerSeparator;
    }
    return result;
  }

  tablecell(content:string, flags:{header: boolean, align: string}) {
    return `${flags.header ? '😿TH😿' : ''}${content}|`;
  }

  strong(text:string) {
    return `*${text}*`;
  }

  em(text:string) {
    return `_${text}_`;
  }

  codespan(text:string) {
    return `\`${entities.decode(text)}\``;
  }

  br() {
    return '\n';
  }

  del(text:string) {
    return `--${text}--`;
  }

  link(href:string, title:string, text:string) {
    if (title) {
      title = ` "${title.replace('"', '\\"')}"`;
    } else {
      title = '';
    }
    return `[${text}](${href}${title})`;
  }

  image(href:string, title:string, text:string) {
    return `!${this.link(href, title, text)}`;
  }

  text(text:string) {
    return entities.decode(text);
  }

}

export function injectAutodetectedLanguage(markdownText: string): string {
  return marked(markdownText, {renderer: new MarkdownMarkdownRenderer()});
}
