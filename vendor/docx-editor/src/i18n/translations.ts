// Translations for the DOCX Editor
export type Locale = "ru" | "en";

export interface Translations {
  variables: {
    title: string;
    name: string;
    type: string;
    description: string;
    example: string;
    copy: string;
    types: Record<string, string>;
  };
  comments: {
    title: string;
    all: string;
    open: string;
    resolved: string;
    noComments: string;
    noCommentsHint: string;
    addComment: string;
    selected: string;
    writePlaceholder: string;
    add: string;
    tipCtrlEnter: string;
    resolve: string;
    reply: string;
    reopen: string;
    delete: string;
    cancel: string;
    replyPlaceholder: string;
    repliesCount: (count: number) => string;
    resolvedBadge: string;
    clickToView: string;
    commentPrefix: string;
    prevComment: string;
    nextComment: string;
    commentPosition: (current: number, total: number) => string;
  };
  history: {
    title: string;
    versionHistory: string;
    save: string;
    selected: string;
    versions: string;
    compareWithCurrent: string;
    selectVersionsToCompare: string;
    reset: string;
    noSavedVersions: string;
    ctrlSToSave: string;
    currentDocument: string;
    latest: string;
    restore: string;
    unified: string;
    sideBySide: string;
  };
  editor: {
    save: string;
    export: string;
    download: string;
    downloadCopy: string;
    downloadOriginal: string;
    undo: string;
    redo: string;
    bold: string;
    italic: string;
    underline: string;
    strikethrough: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    alignJustify: string;
    addImage: string;
    addComment: string;
    showComments: string;
    trackChanges: string;
    acceptAll: string;
    rejectAll: string;
  };
  selectionMenu: {
    comment: string;
    chat: string;
    addToChat: string;
    strikethrough: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
  };
}

const ru: Translations = {
  variables: {
    title: "Переменная шаблона", name: "Название", type: "Тип",
    description: "Описание", example: "Пример", copy: "Копировать",
    types: {
      text: "Текст", textarea: "Многострочный текст", number: "Число", date: "Дата",
      datetime: "Дата и время", boolean: "Да/Нет", money: "Денежная сумма",
      select: "Выбор", multiselect: "Множественный выбор", user: "Пользователь",
      file: "Файл", string: "Текст", array: "Список",
    },
  },
  comments: {
    title: "Комментарии",
    all: "Все",
    open: "Открытые",
    resolved: "Решённые",
    noComments: "Комментариев пока нет",
    noCommentsHint: "Выделите текст и нажмите кнопку комментария",
    addComment: "Добавить комментарий",
    selected: "Выделено",
    writePlaceholder: "Напишите комментарий...",
    add: "Добавить",
    tipCtrlEnter: "Подсказка: Ctrl+Enter для отправки",
    resolve: "Решить",
    reply: "Ответить",
    reopen: "Открыть снова",
    delete: "Удалить",
    cancel: "Отмена",
    replyPlaceholder: "Напишите ответ...",
    repliesCount: (count: number) => {
      if (count === 1) return "1 ответ";
      if (count >= 2 && count <= 4) return `${count} ответа`;
      return `${count} ответов`;
    },
    resolvedBadge: "Решён",
    clickToView: "Нажмите для просмотра комментария",
    commentPrefix: "Комментарий",
    prevComment: "Предыдущий комментарий",
    nextComment: "Следующий комментарий",
    commentPosition: (current: number, total: number) => `${current} из ${total}`,
  },
  history: {
    title: "История",
    versionHistory: "История версий",
    save: "Сохранить",
    selected: "Выбрано",
    versions: "версий",
    compareWithCurrent: "сравнение с текущим",
    selectVersionsToCompare: "Выберите версии для сравнения",
    reset: "Сброс",
    noSavedVersions: "Нет сохранённых версий.",
    ctrlSToSave: "Ctrl+S для сохранения",
    currentDocument: "Текущий документ",
    latest: "Последняя",
    restore: "Восстановить",
    unified: "Инлайн",
    sideBySide: "Рядом",
  },
  editor: {
    save: "Сохранить",
    export: "Экспорт",
    download: "Скачать",
    downloadCopy: "Скачать текущую копию",
    downloadOriginal: "Скачать оригинал",
    undo: "Отменить",
    redo: "Повторить",
    bold: "Жирный",
    italic: "Курсив",
    underline: "Подчёркнутый",
    strikethrough: "Зачёркнутый",
    alignLeft: "По левому краю",
    alignCenter: "По центру",
    alignRight: "По правому краю",
    alignJustify: "По ширине",
    addImage: "Добавить изображение",
    addComment: "Добавить комментарий",
    showComments: "Показать комментарии",
    trackChanges: "Отслеживание изменений",
    acceptAll: "Принять все",
    rejectAll: "Отклонить все",
  },
  selectionMenu: {
    comment: "Комментарий",
    chat: "В чат",
    addToChat: "Добавить в чат (Ctrl+L)",
    strikethrough: "Зачёркнутый",
    alignLeft: "По левому краю",
    alignCenter: "По центру",
    alignRight: "По правому краю",
  },
};

const en: Translations = {
  variables: {
    title: "Template variable", name: "Name", type: "Type",
    description: "Description", example: "Example", copy: "Copy",
    types: {
      text: "Text", textarea: "Multiline text", number: "Number", date: "Date",
      datetime: "Date and time", boolean: "Yes/No", money: "Amount",
      select: "Choice", multiselect: "Multiple choice", user: "User",
      file: "File", string: "Text", array: "List",
    },
  },
  comments: {
    title: "Comments",
    all: "All",
    open: "Open",
    resolved: "Resolved",
    noComments: "No comments yet",
    noCommentsHint: "Select text and click the comment button to add one",
    addComment: "Add Comment",
    selected: "Selected",
    writePlaceholder: "Write your comment...",
    add: "Add",
    tipCtrlEnter: "Tip: Press Ctrl+Enter to submit",
    resolve: "Resolve",
    reply: "Reply",
    reopen: "Reopen",
    delete: "Delete",
    cancel: "Cancel",
    replyPlaceholder: "Write a reply...",
    repliesCount: (count: number) => `${count} ${count === 1 ? "reply" : "replies"}`,
    resolvedBadge: "Resolved",
    clickToView: "Click to view comment",
    commentPrefix: "Comment",
    prevComment: "Previous comment",
    nextComment: "Next comment",
    commentPosition: (current: number, total: number) => `${current} of ${total}`,
  },
  history: {
    title: "History",
    versionHistory: "Version History",
    save: "Save",
    selected: "Selected",
    versions: "versions",
    compareWithCurrent: "comparing with current",
    selectVersionsToCompare: "Select versions to compare",
    reset: "Reset",
    noSavedVersions: "No saved versions.",
    ctrlSToSave: "Ctrl+S to save",
    currentDocument: "Current document",
    latest: "Latest",
    restore: "Restore",
    unified: "Inline",
    sideBySide: "Side by side",
  },
  editor: {
    save: "Save",
    export: "Export",
    download: "Download",
    downloadCopy: "Download current copy",
    downloadOriginal: "Download original",
    undo: "Undo",
    redo: "Redo",
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    strikethrough: "Strikethrough",
    alignLeft: "Align Left",
    alignCenter: "Align Center",
    alignRight: "Align Right",
    alignJustify: "Justify",
    addImage: "Add Image",
    addComment: "Add Comment",
    showComments: "Show Comments",
    trackChanges: "Track Changes",
    acceptAll: "Accept All",
    rejectAll: "Reject All",
  },
  selectionMenu: {
    comment: "Comment",
    chat: "Chat",
    addToChat: "Add to chat (Ctrl+L)",
    strikethrough: "Strikethrough",
    alignLeft: "Align Left",
    alignCenter: "Align Center",
    alignRight: "Align Right",
  },
};

export const translations: Record<Locale, Translations> = { ru, en };

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations.ru;
}

