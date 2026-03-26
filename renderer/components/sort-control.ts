/**
 * Reusable sort control — dropdown for field selection + direction toggle.
 *
 * Renders: [▼ FieldLabel]  [↑]
 * - Click field button → opens dropdown to pick sort field
 * - Click direction button → toggles asc/desc
 * - onChange callback fires with new { field, direction }
 */

export interface SortOption {
  value: string;
  label: string;
}

export interface SortControlConfig {
  area: string;
  options: SortOption[];
  currentField: string;
  currentDirection: 'asc' | 'desc';
  onChange: (field: string, direction: 'asc' | 'desc') => void;
}

export interface SortControlHandle {
  element: HTMLElement;
  update: (field: string, direction: 'asc' | 'desc') => void;
  destroy: () => void;
}

export function createSortControl(config: SortControlConfig): SortControlHandle {
  const bar = document.createElement('div');
  bar.className = 'sort-control-bar';

  let currentField = config.currentField;
  let currentDirection = config.currentDirection;
  let dropdownVisible = false;
  let dropdown: HTMLElement | null = null;

  // Field selector button
  const fieldBtn = document.createElement('button');
  fieldBtn.className = 'sort-field-btn focusable';
  fieldBtn.tabIndex = 0;

  function getFieldLabel(field: string): string {
    const opt = config.options.find(o => o.value === field);
    return opt ? opt.label : field;
  }

  function updateFieldBtn(): void {
    fieldBtn.textContent = `▼ ${getFieldLabel(currentField)}`;
    fieldBtn.title = `Sort by: ${getFieldLabel(currentField)}`;
  }

  // Direction toggle button
  const dirBtn = document.createElement('button');
  dirBtn.className = 'sort-direction-btn focusable';
  dirBtn.tabIndex = 0;

  function updateDirBtn(): void {
    dirBtn.textContent = currentDirection === 'asc' ? '↑' : '↓';
    dirBtn.title = currentDirection === 'asc' ? 'Ascending' : 'Descending';
  }

  // Sort label
  const label = document.createElement('span');
  label.className = 'sort-control-label';
  label.textContent = 'Sort:';

  function closeDropdown(): void {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
    dropdownVisible = false;
  }

  function openDropdown(): void {
    if (dropdownVisible) { closeDropdown(); return; }

    dropdown = document.createElement('div');
    dropdown.className = 'sort-dropdown';

    const rect = fieldBtn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.left = `${rect.left}px`;

    config.options.forEach(opt => {
      const optBtn = document.createElement('button');
      optBtn.className = 'sort-dropdown-option';
      if (opt.value === currentField) optBtn.classList.add('active');
      optBtn.textContent = opt.label;
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentField = opt.value;
        updateFieldBtn();
        closeDropdown();
        config.onChange(currentField, currentDirection);
      });
      dropdown!.appendChild(optBtn);
    });

    document.body.appendChild(dropdown);
    dropdownVisible = true;

    // Close on outside click
    const outsideHandler = (e: MouseEvent) => {
      if (dropdown && !dropdown.contains(e.target as Node) && !fieldBtn.contains(e.target as Node)) {
        closeDropdown();
        document.removeEventListener('click', outsideHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', outsideHandler), 0);
  }

  fieldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown();
  });

  dirBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    updateDirBtn();
    closeDropdown();
    config.onChange(currentField, currentDirection);
  });

  // Initialize
  updateFieldBtn();
  updateDirBtn();

  bar.appendChild(label);
  bar.appendChild(fieldBtn);
  bar.appendChild(dirBtn);

  return {
    element: bar,
    update(field: string, direction: 'asc' | 'desc') {
      currentField = field;
      currentDirection = direction;
      updateFieldBtn();
      updateDirBtn();
    },
    destroy() {
      closeDropdown();
      bar.remove();
    },
  };
}
