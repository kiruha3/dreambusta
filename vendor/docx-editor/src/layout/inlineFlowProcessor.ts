import { TextMeasurer } from "./textMeasurer";
import { DocumentElement, FlowRange, FontProperties, LineFlowRangesProvider, TextElement, TextLine, TextLinePart, TextLinePartWord, TextRun } from "./types";

type Alignment = 'left' | 'right' | 'center' | 'both';

type LineFlowRangeWord = {
  word: string;
  width: number;
  font: FontProperties;
  el: TextElement;
}

export class InlineFlowProcessor {
  private _textMeasurer: TextMeasurer;
  private _element: DocumentElement;
  private _alignment: Alignment;
  private _linesVerticalStartOffset: number = 0;
  private _lineWidth: number;
  private _lineStartOffset: number = 0;
  private _lineEndOffset: number = 0;
  private _lineFlowRangesProvider: LineFlowRangesProvider;
  private _defaultFont: FontProperties;
  private _onBeforeLine: (line: TextLine) => void;
  
  private _lines: TextLine[] = [];

  private _assembledPartWords: string[] = [];
  private _assembledPartLineRelativeX = 0;

  private _assembledLineParts: TextLinePart[] = [];
  private _assembledLineHeight = 0;
  
  // Current flow ranges tracking
  private _assembledLineFlowRanges: FlowRange[] = [];
  private _assembledLineCurrentFlowRangeIndex = 0;
  private _assembledLineCurrentFlowRangeWords: LineFlowRangeWord[] = [];
  private _assembledLineCurrentFlowRangeRemainingWidth = 0;

  constructor(props: {
    textMeasurer: TextMeasurer
    element: DocumentElement
    alignment: Alignment;
    linesVerticalStartOffset: number
    lineStartOffset: number
    lineEndOffset: number
    lineWidth: number
    lineFlowRangesProvider: LineFlowRangesProvider
    defaultFont: FontProperties
    onBeforeLine: (line: TextLine) => void
  }) {
    this._textMeasurer = props.textMeasurer;
    this._element = props.element;
    this._alignment = props.alignment;
    this._linesVerticalStartOffset = props.linesVerticalStartOffset;
    this._lineStartOffset = props.lineStartOffset;
    this._lineEndOffset = props.lineEndOffset;
    this._lineWidth = props.lineWidth;
    this._lineFlowRangesProvider = props.lineFlowRangesProvider;
    this._defaultFont = props.defaultFont;
    this._onBeforeLine = props.onBeforeLine;
  }

  layout(textEl: TextElement, font?: FontProperties) {
    const fontToUse = font || this._defaultFont;
    const textWords = textEl.text.split(' ').map(word => `${word} `);
    if (textWords.length) {
      const lastWord = textWords[textWords.length - 1];
      if (lastWord.length === 1) {
        // Remove trailing empty word, text ends on a space
        textWords.pop();
      } else {
        textWords[textWords.length - 1] = lastWord.slice(0, -1);
      }
    }
    const runSpaceTextWidth = this._textMeasurer.measureTextWidth(' ', fontToUse);

    // Update line height if this run has larger font
    const runLineHeight = fontToUse.size * fontToUse.lineHeight;
    if (runLineHeight > this._assembledLineHeight) {
      this._initializeFlowLine(fontToUse);
    }

    // Get flow ranges for current line
    if (this._assembledLineFlowRanges.length === 0) {
      this._initializeAssembledLineFlowRanges();
      this._initializeAssembledLineFlowRange();
      // this._initializeLinePart(this._assembledLineFlowRanges[0].x);
    }

    // Process words from current run
    for (let textWordIndex = 0; textWordIndex < textWords.length; textWordIndex++) {
      const word = textWords[textWordIndex];
      const wordWidth = this._textMeasurer.measureTextWidth(word, fontToUse);
      // const spaceWidth = this._assembledPartWords.length > 0 ? runSpaceTextWidth : 0;
      // const testWidth = wordWidth + spaceWidth;

      if (wordWidth > this._assembledLineCurrentFlowRangeRemainingWidth) {
        // this._finalizeLinePart(textEl, fontToUse, true);

        this._finalizeLineFlowRange();

        while (wordWidth > this._assembledLineCurrentFlowRangeRemainingWidth) {
          this._assembledLineCurrentFlowRangeIndex++;
          if (this._assembledLineCurrentFlowRangeIndex >= this._assembledLineFlowRanges.length) {
            this._finalizeFlowLine();
            this._initializeFlowLine(fontToUse);
            this._initializeAssembledLineFlowRanges();
          }
          this._initializeAssembledLineFlowRange();
        }
        // this._initializeLinePart(this._assembledLineFlowRanges[this._assembledLineCurrentFlowRangeIndex].x);
      }

      this._assembledLineCurrentFlowRangeWords.push({
        word: word,
        width: wordWidth,
        font: fontToUse,
        el: textEl,
      });
      this._assembledPartWords.push(word);
      this._assembledLineCurrentFlowRangeRemainingWidth -= wordWidth;
    }

    // Finalize remaining words in current part
    // if (this._assembledPartWords.length > 0) {
    //   const partWidth = this._finalizeLinePart(textEl, fontToUse);
    //   this._initializeLinePart(this._assembledPartLineRelativeX + partWidth);
    // }
  }

  public finalizeLine() {
    this._finalizeLineFlowRange(true);
    this._finalizeFlowLine();
  }
  
  public flushLines(): TextLine[] {
    const lines = this._lines;
    this._lines = [];

    return lines;
  }

  get lineStartOffset() {
    return this._lineStartOffset;
  }

  public setLineStartOffset(offset: number) {
    this._lineStartOffset = offset;
  }

  get lineEndOffset() {
    return this._lineEndOffset;
  }

  public setLineEndOffset(offset: number) {
    this._lineEndOffset = offset;
  }

  private _initializeAssembledLineFlowRange() {
    this._assembledLineCurrentFlowRangeRemainingWidth = this._assembledLineFlowRanges[this._assembledLineCurrentFlowRangeIndex].width;
  }

  private _initializeAssembledLineFlowRanges() {
    this._assembledLineFlowRanges = this._lineFlowRangesProvider(this._getLineY(), this._assembledLineHeight);
    this._assembledLineCurrentFlowRangeIndex = 0;
  }

  private _initializeLinePart(startX: number) {
    this._assembledPartLineRelativeX = startX;
    this._assembledPartWords = [];
  }

  private _finalizeLinePart(textEl: TextElement, font: FontProperties, lastInLine?: boolean) {
    if (this._assembledPartWords.length > 0) {
      const currentFlowRange = this._assembledLineFlowRanges[this._assembledLineCurrentFlowRangeIndex];
      const partWidth = currentFlowRange.width - (lastInLine ? 0 : this._assembledLineCurrentFlowRangeRemainingWidth) 
        - this._assembledPartLineRelativeX + currentFlowRange.x;
      this._assembledLineParts.push({
        x: this._assembledPartLineRelativeX,
        width: partWidth,
        text: this._assembledPartWords.join(''),
        font: font,
        el: textEl,
        words: [],
      });
      return partWidth;
    } else {
      return 0;
    }
  }

  private _finalizeLineFlowRange(forLastLine?: boolean) {
    const words = this._assembledLineCurrentFlowRangeWords;
    if (!words.length) {
      return;
    }
    
    const partWords: TextLinePartWord[] = [];
    const alignment = forLastLine && this._alignment === 'both' 
      ? 'left' 
      : this._alignment;
    switch (alignment) {
      case 'left': {
        let x = 0;
        words.forEach(word => {
          partWords.push({
            x,
            width: word.width,
            text: word.word,
            font: word.font,
            el: word.el,
          });
          x += word.width;
        });
        break;
      }
      case 'right': {
        let x = this._assembledLineCurrentFlowRangeRemainingWidth;
        words.forEach(word => {
          partWords.push({
            x,
            width: word.width,
            text: word.word,
            font: word.font,
            el: word.el,
          });
          x += word.width;
        });
        break;
      }
      case 'center': {
        let x = this._assembledLineCurrentFlowRangeRemainingWidth / 2;
        words.forEach(word => {
          partWords.push({
            x,
            width: word.width,
            text: word.word,
            font: word.font,
            el: word.el,
          });
          x += word.width;
        });
        break;
      }
      case 'both': {
        const spaceExpansion = this._assembledLineCurrentFlowRangeRemainingWidth / (words.length - 1);
        let x = 0;
        words.forEach(word => {
          partWords.push({
            x,
            width: word.width,
            text: word.word,
            font: word.font,
            el: word.el,
          });
          x = x + word.width + spaceExpansion;
        });
        break;
      }
    }

    this._assembledLineParts.push({
      x: this._assembledLineFlowRanges[this._assembledLineCurrentFlowRangeIndex].x,
      width: this._assembledLineFlowRanges[this._assembledLineCurrentFlowRangeIndex].width,
      text: partWords.map(word => word.text).join(''),
      font: this._defaultFont,
      words: partWords,
    });

    this._assembledLineCurrentFlowRangeWords = [];
  }

  private _initializeFlowLine(font: FontProperties) {
    this._assembledLineHeight = font.size * font.lineHeight;
  }

  private _finalizeFlowLine() {
    if (this._assembledLineParts.length > 0) {
      const line: TextLine = {
        element: this._element,
        x: 0,
        y: this._getLineY(),
        width: this._lineWidth,
        height: this._assembledLineHeight,
        text: this._assembledLineParts.map(part => part.text).join(''),
        parts: [...this._assembledLineParts],
      };

      this._onBeforeLine(line);

      this._lines.push(line);
    }
    this._assembledLineParts = [];
    this._assembledLineHeight = 0;

    this._assembledLineFlowRanges = [];
    this._assembledLineCurrentFlowRangeIndex = 0;
    this._assembledLineCurrentFlowRangeRemainingWidth = 0;
  }

  private _getLineY() {
    const lastLine = this._lines[this._lines.length - 1];
    return lastLine ? lastLine.y + lastLine.height : this._linesVerticalStartOffset;
  }
}