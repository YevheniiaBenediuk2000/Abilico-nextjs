/**
 * Customizes the Leaflet.draw toolbar to add:
 * - A "Caution" button at the top (for drawing obstacles)
 * - A dropdown toggle button to show/hide the 4 drawing tools
 * - Collapsed state by default (only caution + dropdown + edit + delete visible)
 */

let cautionDrawHandler = null;
let cautionMarkerListenerAdded = false;

export function customizeDrawToolbar(drawControl, map) {
  if (!drawControl || !map) return;

  // Wait for the control to be added to the DOM
  const tryCustomize = () => {
    const drawContainer = map.getContainer().querySelector('.leaflet-control.leaflet-draw');
    if (!drawContainer) {
      // Control not yet in DOM, try again after a short delay
      setTimeout(tryCustomize, 100);
      return;
    }

    // Find the draw toolbar section (contains polyline, polygon, rectangle, circle)
    const drawSection = drawContainer.querySelector('.leaflet-draw-section:first-child');
    if (!drawSection) return;

    const toolbar = drawSection.querySelector('.leaflet-draw-toolbar');
    if (!toolbar) return;

    // Check if already customized
    if (toolbar.dataset.customized === 'true') return;
    toolbar.dataset.customized = 'true';

    // Get all the draw tool buttons (polyline, polygon, rectangle, circle)
    // Leaflet.draw uses classes like leaflet-draw-draw-polyline, etc.
    const drawToolButtons = Array.from(toolbar.querySelectorAll('a[class*="leaflet-draw-draw-polyline"], a[class*="leaflet-draw-draw-polygon"], a[class*="leaflet-draw-draw-rectangle"], a[class*="leaflet-draw-draw-circle"]'));
    
    if (drawToolButtons.length === 0) {
      // Fallback: try to find by title attribute
      const fallbackButtons = Array.from(toolbar.querySelectorAll('a[title]')).filter(btn => {
        const title = (btn.title || '').toLowerCase();
        return title.includes('polyline') || title.includes('polygon') || title.includes('rectangle') || title.includes('circle');
      });
      if (fallbackButtons.length > 0) {
        drawToolButtons.push(...fallbackButtons);
      } else {
        return;
      }
    }

    // Create container for the draw tools that can be collapsed
    const drawToolsContainer = document.createElement('div');
    drawToolsContainer.className = 'leaflet-draw-tools-container';
    drawToolsContainer.style.display = 'none'; // Start collapsed

    // Store reference to draw tool buttons before moving them
    const drawToolButtonsRef = [...drawToolButtons];

    // Move draw tool buttons into the collapsible container and customize them
    drawToolButtons.forEach(btn => {
      drawToolsContainer.appendChild(btn);
      // Customize each button with MUI icon
      customizeDrawToolButton(btn);
    });

    // Create caution button
    const cautionButton = document.createElement('a');
    cautionButton.className = 'leaflet-draw-toolbar-button leaflet-draw-toolbar-button-caution';
    cautionButton.href = '#';
    cautionButton.title = 'Draw obstacles';
    cautionButton.setAttribute('role', 'button');
    
    // Load and insert caution icon
    fetch('/icons/maki/caution.svg')
      .then(res => res.text())
      .then(svgText => {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = svgDoc.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', '24');
          svg.setAttribute('height', '24');
          svg.style.display = 'block';
          cautionButton.appendChild(svg);
        }
      })
      .catch(err => {
        console.error('Failed to load caution icon:', err);
        // Fallback: use text
        cautionButton.textContent = '⚠';
        cautionButton.style.color = '#FFC107';
      });

    // Create caution icon for marker - circular badge style like POI
    const cautionIcon = L.divIcon({
      className: "caution-badge-wrapper",
      html: `
        <div class="caution-badge">
          <img src="/icons/maki/caution.svg" alt="Caution" />
        </div>
      `,
      iconSize: [33, 33],
      iconAnchor: [16, 30],
      popupAnchor: [0, -20],
      tooltipAnchor: [0, -16],
    });

    // Create custom marker draw handler for caution tool (only once)
    if (!cautionDrawHandler && typeof L !== 'undefined' && L.Draw && L.Draw.Marker) {
      // Create a custom marker class that uses obstacles pane
      const CautionMarker = L.Marker.extend({
        initialize: function(latlng, options) {
          options = options || {};
          options.pane = options.pane || "obstaclesPane";
          options.zIndexOffset = options.zIndexOffset || 1000;
          L.Marker.prototype.initialize.call(this, latlng, options);
        }
      });

      cautionDrawHandler = new L.Draw.Marker(map, {
        icon: cautionIcon,
        repeatMode: false, // Stop drawing after one marker
      });

      // Override the _createMarker method to use obstacles pane
      const originalCreateMarker = cautionDrawHandler._createMarker;
      cautionDrawHandler._createMarker = function(latlng) {
        const marker = originalCreateMarker.call(this, latlng);
        marker.options.pane = "obstaclesPane";
        marker.options.zIndexOffset = 1000;
        marker.options.isCautionMarker = true;
        // Update the marker's pane if it's already rendered
        if (marker._icon) {
          const pane = map.getPane("obstaclesPane");
          if (pane) {
            pane.appendChild(marker._icon);
          }
        }
        return marker;
      };
      
      // Store icon reference for later use
      cautionDrawHandler._cautionIcon = cautionIcon;
      cautionDrawHandler._isCautionHandler = true;
      
      // Mark layers created by this handler (only add listener once)
      if (!cautionMarkerListenerAdded) {
        map.on(L.Draw.Event.CREATED, function(e) {
          if (e.layerType === 'marker' && cautionDrawHandler && cautionDrawHandler._enabled) {
            e.layer.options.isCautionMarker = true;
          }
        });
        cautionMarkerListenerAdded = true;
      }
    }

    // Click handler for caution button - enables marker draw mode
    cautionButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Ensure handler exists
      if (!cautionDrawHandler && typeof L !== 'undefined' && L.Draw && L.Draw.Marker) {
        cautionDrawHandler = new L.Draw.Marker(map, {
          icon: cautionIcon,
          repeatMode: false,
        });
        cautionDrawHandler._cautionIcon = cautionIcon;
      }
      
      if (!cautionDrawHandler) {
        console.error('Caution draw handler not available');
        return;
      }
      
      // Disable any active draw mode first
      if (drawControl && drawControl._toolbars && drawControl._toolbars.draw && drawControl._toolbars.draw._activeMode) {
        drawControl._toolbars.draw._activeMode.handler.disable();
      }
      
      // Enable caution marker draw mode
      cautionDrawHandler.enable();
      
      // Update button state
      cautionButton.classList.add('leaflet-draw-toolbar-button-enabled');
    });

    // Create dropdown toggle button
    const dropdownButton = document.createElement('a');
    dropdownButton.className = 'leaflet-draw-toolbar-button leaflet-draw-toolbar-button-dropdown';
    dropdownButton.href = '#';
    dropdownButton.title = 'Show drawing tools';
    dropdownButton.setAttribute('role', 'button');
    dropdownButton.style.display = 'flex';
    dropdownButton.style.alignItems = 'center';
    dropdownButton.style.justifyContent = 'center';
    
    // Create container for React icon
    const iconContainer = document.createElement('div');
    iconContainer.style.display = 'flex';
    iconContainer.style.alignItems = 'center';
    iconContainer.style.justifyContent = 'center';
    iconContainer.style.width = '100%';
    iconContainer.style.height = '100%';
    iconContainer.style.color = '#666';
    dropdownButton.appendChild(iconContainer);

    // Toggle dropdown state - start collapsed
    let isExpanded = false; // Start collapsed
    let iconUnmount = null;

    // Function to update icon
    const updateIcon = async () => {
      try {
        // Dynamically import React and the icon component
        const ReactMod = await import('react');
        const ReactDOMMod = await import('react-dom/client');
        const IconMod = await import('../components/DrawToolbarExpandIcon.jsx');
        
        const React = ReactMod.default || ReactMod;
        const { createRoot } = ReactDOMMod;
        const DrawToolbarExpandIcon = IconMod.default || IconMod.DrawToolbarExpandIcon || IconMod;
        
        // Unmount previous icon if exists
        if (iconUnmount) {
          iconUnmount();
        }
        
        // Mount new icon
        const root = createRoot(iconContainer);
        root.render(React.createElement(DrawToolbarExpandIcon, { expanded: isExpanded }));
        iconUnmount = () => root.unmount();
      } catch (err) {
        console.error('Failed to load MUI icons, using fallback:', err);
        // Fallback to text
        iconContainer.innerHTML = isExpanded ? '▲' : '▼';
        iconContainer.style.fontSize = '12px';
        iconContainer.style.color = '#666';
      }
    };

    // Initial icon - start collapsed
    updateIcon();
    dropdownButton.title = 'Show drawing tools';

    dropdownButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isExpanded = !isExpanded;
      if (isExpanded) {
        drawToolsContainer.style.display = 'block';
        dropdownButton.title = 'Hide drawing tools';
        dropdownButton.classList.add('expanded');
      } else {
        drawToolsContainer.style.display = 'none';
        dropdownButton.title = 'Show drawing tools';
        dropdownButton.classList.remove('expanded');
      }
      
      // Update icon
      updateIcon();
    });

    // Insert caution button at the top
    toolbar.insertBefore(cautionButton, toolbar.firstChild);
    
    // Insert dropdown button right after caution
    if (cautionButton.nextSibling) {
      toolbar.insertBefore(dropdownButton, cautionButton.nextSibling);
    } else {
      toolbar.appendChild(dropdownButton);
    }
    
    // Insert collapsible container right after dropdown
    if (dropdownButton.nextSibling) {
      toolbar.insertBefore(drawToolsContainer, dropdownButton.nextSibling);
    } else {
      toolbar.appendChild(drawToolsContainer);
    }

    // Customize edit and delete buttons
    customizeEditDeleteButtons(drawContainer, map);
  };

  // Start trying to customize
  tryCustomize();
}

/**
 * Customizes the edit and delete buttons to use MUI icons
 */
async function customizeEditDeleteButtons(drawContainer, map) {
  // Try multiple times to find the edit/delete section (it might load after draw section)
  const tryFindEditSection = (attempts = 0) => {
    if (attempts > 10) return; // Give up after 1 second

    // Find the edit/delete section (usually the second section or last section)
    const editSection = drawContainer.querySelector('.leaflet-draw-section:last-child') ||
                        drawContainer.querySelector('.leaflet-draw-section:nth-child(2)');
    
    if (!editSection) {
      setTimeout(() => tryFindEditSection(attempts + 1), 100);
      return;
    }

    const editToolbar = editSection.querySelector('.leaflet-draw-toolbar');
    if (!editToolbar) {
      setTimeout(() => tryFindEditSection(attempts + 1), 100);
      return;
    }

    // Find edit and delete buttons - try multiple selectors
    const allButtons = editToolbar.querySelectorAll('a');
    let editButton = null;
    let deleteButton = null;

    allButtons.forEach(btn => {
      const className = btn.className || '';
      const title = (btn.title || '').toLowerCase();
      
      if (className.includes('edit-edit') || title.includes('edit')) {
        editButton = btn;
      } else if (className.includes('edit-remove') || className.includes('remove') || title.includes('delete') || title.includes('remove')) {
        deleteButton = btn;
      }
    });

    // Customize edit button
    if (editButton && !editButton.dataset.muiCustomized) {
      editButton.dataset.muiCustomized = 'true';
      customizeButtonWithMuiIcon(editButton, 'edit');
    }

    // Customize delete button
    if (deleteButton && !deleteButton.dataset.muiCustomized) {
      deleteButton.dataset.muiCustomized = 'true';
      customizeButtonWithMuiIcon(deleteButton, 'delete');
    }
  };

  tryFindEditSection();
}

/**
 * Customizes a drawing tool button with a MUI icon
 */
async function customizeDrawToolButton(button) {
  // Determine which icon to use based on button class
  let iconType = null;
  const className = button.className || '';
  
  if (className.includes('polyline')) {
    iconType = 'polyline';
  } else if (className.includes('polygon')) {
    iconType = 'polygon';
  } else if (className.includes('rectangle')) {
    iconType = 'rectangle';
  } else if (className.includes('circle')) {
    iconType = 'circle';
  }
  
  if (!iconType) return;
  
  // Check if already customized
  if (button.dataset.muiCustomized === 'true') return;
  button.dataset.muiCustomized = 'true';
  
  // Remove default icon/spans
  const iconSpans = button.querySelectorAll('span, .leaflet-draw-toolbar-icon');
  iconSpans.forEach(span => {
    span.style.display = 'none';
    span.remove();
  });
  
  // Create container for React icon
  const iconContainer = document.createElement('div');
  iconContainer.style.display = 'flex';
  iconContainer.style.alignItems = 'center';
  iconContainer.style.justifyContent = 'center';
  iconContainer.style.width = '100%';
  iconContainer.style.height = '100%';
  
  // Clear button content and add container
  button.innerHTML = '';
  button.appendChild(iconContainer);
  
  // Mount MUI icon
  try {
    const ReactMod = await import('react');
    const ReactDOMMod = await import('react-dom/client');
    
    let IconComponent;
    if (iconType === 'polyline') {
      const IconMod = await import('../components/DrawToolbarPolylineIcon.jsx');
      IconComponent = IconMod.default || IconMod;
    } else if (iconType === 'polygon') {
      const IconMod = await import('../components/DrawToolbarPolygonIcon.jsx');
      IconComponent = IconMod.default || IconMod;
    } else if (iconType === 'rectangle') {
      const IconMod = await import('../components/DrawToolbarRectangleIcon.jsx');
      IconComponent = IconMod.default || IconMod;
    } else if (iconType === 'circle') {
      const IconMod = await import('../components/DrawToolbarCircleIcon.jsx');
      IconComponent = IconMod.default || IconMod;
    }
    
    if (IconComponent) {
      const React = ReactMod.default || ReactMod;
      const { createRoot } = ReactDOMMod;
      const root = createRoot(iconContainer);
      root.render(React.createElement(IconComponent));
    }
  } catch (err) {
    console.error(`Failed to load MUI ${iconType} icon:`, err);
    // Fallback
    iconContainer.textContent = iconType === 'polyline' ? '─' : iconType === 'polygon' ? '⬟' : iconType === 'rectangle' ? '▭' : '●';
    iconContainer.style.fontSize = '16px';
  }
}

/**
 * Replaces a button's default icon with a MUI icon
 */
async function customizeButtonWithMuiIcon(button, type) {
  // Remove default icon/spans
  const iconSpans = button.querySelectorAll('span, .leaflet-draw-toolbar-icon');
  iconSpans.forEach(span => {
    span.style.display = 'none';
    span.remove();
  });

  // Create container for React icon
  const iconContainer = document.createElement('div');
  iconContainer.style.display = 'flex';
  iconContainer.style.alignItems = 'center';
  iconContainer.style.justifyContent = 'center';
  iconContainer.style.width = '100%';
  iconContainer.style.height = '100%';
  
  // Clear button content and add container
  button.innerHTML = '';
  button.appendChild(iconContainer);

  // Mount MUI icon
  try {
    const ReactMod = await import('react');
    const ReactDOMMod = await import('react-dom/client');
    
    let IconComponent;
    if (type === 'edit') {
      const EditIconMod = await import('../components/DrawToolbarEditIcon.jsx');
      IconComponent = EditIconMod.default || EditIconMod;
    } else if (type === 'delete') {
      const DeleteIconMod = await import('../components/DrawToolbarDeleteIcon.jsx');
      IconComponent = DeleteIconMod.default || DeleteIconMod;
    }

    if (IconComponent) {
      const React = ReactMod.default || ReactMod;
      const { createRoot } = ReactDOMMod;
      const root = createRoot(iconContainer);
      root.render(React.createElement(IconComponent));
    }
  } catch (err) {
    console.error(`Failed to load MUI ${type} icon:`, err);
    // Fallback
    iconContainer.textContent = type === 'edit' ? '✏️' : '🗑️';
    iconContainer.style.fontSize = '16px';
  }
}

export function getCautionDrawHandler() {
  return cautionDrawHandler;
}

