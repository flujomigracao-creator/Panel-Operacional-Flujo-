import React, { useState, useRef, useEffect } from 'react';

const AVAILABLE_VARS = [
  '{nombre}', '{cpf}', '{email}', '{telefono}', 
  '{nacionalidad}', '{estado_civil}', '{profesion}', 
  '{fecha_actual}', '{direccion}', '{pasaporte}', '{rnms}'
];

export default function AutocompleteTextarea({
  value,
  onChange,
  className,
  placeholder,
  rows = 5,
  id,
  required,
  style,
  onKeyDown
}) {
  const [varSuggestions, setVarSuggestions] = useState(false);
  const [filterVar, setFilterVar] = useState('');
  const textareaRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    if (onChange) onChange(e);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/\{([a-zA-Z0-9_]*)$/);
    if (match) {
      setVarSuggestions(true);
      setFilterVar(match[1].toLowerCase());
    } else {
      setVarSuggestions(false);
    }
  };

  const handleSelectVar = (v) => {
    const ta = textareaRef.current;
    const cursorPosition = ta ? ta.selectionStart : (value ? value.length : 0);
    const val = value || '';
    const textBeforeCursor = val.slice(0, cursorPosition);
    const textAfterCursor = val.slice(cursorPosition);

    const newTextBefore = textBeforeCursor.replace(/\{[a-zA-Z0-9_]*$/, v);
    
    const fakeEvent = {
      target: { value: newTextBefore + textAfterCursor }
    };
    if (onChange) onChange(fakeEvent);
    setVarSuggestions(false);

    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newTextBefore.length, newTextBefore.length);
      }
    }, 0);
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <textarea
        ref={textareaRef}
        id={id}
        required={required}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        className={className || "w-full h-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none"}
        style={style}
      />

      {varSuggestions && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto bottom-full mb-1">
          {AVAILABLE_VARS.filter(v => v.toLowerCase().includes(filterVar)).length > 0 ? (
            AVAILABLE_VARS.filter(v => v.toLowerCase().includes(filterVar)).map((v) => (
              <div
                key={v}
                onClick={() => handleSelectVar(v)}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 text-gray-700"
              >
                {v}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No hay variables que coincidan</div>
          )}
        </div>
      )}
    </div>
  );
}
