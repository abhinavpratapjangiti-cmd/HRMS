(function () {
    let allEmployees = [];

    async function initTeam() {
        const container = document.getElementById("orgTreeContainer");
        try {
            // Fetch data
            // CRITICAL: Your backend API route for "/team/my" MUST be updated to return 
            // the entire company table if the user is a Manager/Admin. 
            allEmployees = await apiGet("/team/my");

            if (!allEmployees || allEmployees.length === 0) {
                container.innerHTML = '<div class="text-center py-5">No team members found.</div>';
                return;
            }

            renderFullTree(allEmployees);
            updateStats(allEmployees);
            attachStatFilters();

        } catch (e) {
            console.error("Team Init Error:", e);
            container.innerHTML = '<div class="text-danger text-center p-3">Error loading organizational chart.</div>';
        }
    }
    window.initTeam = initTeam;

    // --- 1. RECURSIVE TREE RENDERER (Horizontal) ---
    function renderFullTree(list) {
        const allIds = list.map(e => e.id);
        
        // PATCHED: Added check for manager_id === 0 or '0' (Common DB issue for top-level nodes)
        const roots = list.filter(e => 
            !e.manager_id || 
            e.manager_id === 0 || 
            e.manager_id === '0' || 
            !allIds.includes(e.manager_id)
        );

        const buildNode = (emp) => {
            // Find all employees who report to this specific employee
            const children = list.filter(e => e.manager_id == emp.id);
            const roleClass = (emp.role || '').toLowerCase().includes('admin') || 
                              (emp.designation || '').toLowerCase().includes('manager') 
                              ? 'role-manager' : 'role-staff';

            let html = `
                <li>
                    <div class="org-card ${roleClass}" onclick="window.teamActions.viewProfile(${emp.id})">
                        <div class="org-avatar">${emp.name ? emp.name.charAt(0).toUpperCase() : '?'}</div>
                        <span class="org-name">${emp.name || 'Unknown'}</span>
                        <span class="org-role">${emp.designation || 'Admin'}</span>
                    </div>`;

            if (children.length > 0) {
                html += `<ul>${children.map(child => buildNode(child)).join('')}</ul>`;
            }

            html += `</li>`;
            return html;
        };

        // Renders all top-level roots side-by-side if there are multiple
        const treeHtml = `<ul>${roots.map(root => buildNode(root)).join('')}</ul>`;
        document.getElementById("orgTreeContainer").innerHTML = `<div class="org-tree">${treeHtml}</div>`;
    }

    // --- 2. HIERARCHY PATH RENDERER (Vertical) ---
    async function loadHierarchyPath(empId) {
        try {
            window.teamActions.closeModal();

            const pathData = await apiGet(`/team/path/${empId}`);

            if(!pathData || !pathData.length) return;

            document.getElementById("orgTreeContainer").classList.add("d-none");
            const treeControls = document.getElementById("treeControls");
            if(treeControls) treeControls.classList.add("d-none"); 
            
            document.getElementById("singlePathContainer").classList.remove("d-none");
            document.getElementById("resetOrgBtn").classList.remove("d-none");

            renderPathHTML(pathData);

        } catch (err) {
            console.error("Path load failed", err);
            alert("Failed to load hierarchy chain.");
        }
    }

    function renderPathHTML(pathData) {
        const container = document.getElementById("singlePathContainer");
        const visualOrder = [...pathData].reverse();

        container.innerHTML = `
            <div class="d-flex flex-column align-items-center">
                ${visualOrder.map((node, index) => {
                    const isTop = index === 0;
                    const isSelected = index === visualOrder.length - 1;
                    const borderClass = isSelected ? '#4f46e5' : '#ccc';

                    return `
                    <div class="card p-3 mb-2 text-center shadow-sm" style="width: 280px; border-left: 5px solid ${borderClass};">
                        <h5 class="mb-1" style="font-weight:700">${node.name}</h5>
                        <p class="text-muted mb-0 small">${node.designation || 'Admin'}</p>
                        ${isTop ? '<span class="badge bg-warning text-dark mt-2">👑 Top Level</span>' : ''}
                        ${isSelected ? '<span class="badge bg-primary mt-2">🎯 Selected</span>' : ''}
                    </div>
                    ${index < visualOrder.length - 1 ? '<div class="h3 text-muted my-1">⬇</div>' : ''}
                    `;
                }).join("")}
            </div>
        `;
    }

    // --- HELPERS ---
    function updateStats(list) {
        const teamCountEl = document.getElementById("statTeamCount");
        const onlineCountEl = document.getElementById("statOnlineCount");
        const deptCountEl = document.getElementById("statDeptCount");

        if(teamCountEl) teamCountEl.innerText = list.length;
        if(onlineCountEl) onlineCountEl.innerText = list.filter(x => x.online).length;
        
        const depts = new Set(list.map(i => i.designation ? i.designation.split(' ')[0] : 'General'));
        if(deptCountEl) deptCountEl.innerText = depts.size;
    }

    // --- ACTIONS ---
    window.teamActions = {
        viewProfile: (id) => {
            const emp = allEmployees.find(e => e.id == id);
            if (!emp) return;
            const mgr = allEmployees.find(m => m.id == emp.manager_id);

            document.getElementById("modalName").innerText = emp.name;
            document.getElementById("modalRole").innerText = emp.designation || 'Admin';
            if(document.getElementById("modalId")) document.getElementById("modalId").innerText = `#${emp.id}`;
            document.getElementById("modalManager").innerText = mgr ? mgr.name : 'None';
            document.getElementById("modalAvatar").innerText = emp.name ? emp.name.charAt(0).toUpperCase() : '?';

            const btnHierarchy = document.getElementById("btnViewHierarchy");
            if(btnHierarchy) {
                btnHierarchy.onclick = () => loadHierarchyPath(emp.id);
            }

            const modal = document.getElementById("profileModal");
            modal.classList.remove("hidden");
            setTimeout(() => modal.classList.add("active"), 10);
        },
        closeModal: () => {
            const modal = document.getElementById("profileModal");
            modal.classList.remove("active");
            setTimeout(() => modal.classList.add("hidden"), 300);
        },
        resetView: () => {
            document.getElementById("singlePathContainer").classList.add("d-none");
            document.getElementById("resetOrgBtn").classList.add("d-none");
            document.getElementById("orgTreeContainer").classList.remove("d-none");
            
            const treeControls = document.getElementById("treeControls");
            if(treeControls) treeControls.classList.remove("d-none");
        },
        expandAll: () => { /* Logic for expand can be added here if needed */ },
        collapseAll: () => { /* Logic for collapse can be added here if needed */ }
    };

    const profileModal = document.getElementById("profileModal");
    if(profileModal) {
        profileModal.addEventListener("click", (e) => {
            if(e.target.id === "profileModal") window.teamActions.closeModal();
        });
    }

    function attachStatFilters() {
        const totalCard = document.getElementById("totalMembersCard");
        const onlineCard = document.getElementById("onlineNowCard");
        const deptCard = document.getElementById("departmentsCard");
        const filterLabel = document.getElementById("activeFilterLabel");

        if(!totalCard || !onlineCard || !deptCard || !filterLabel) return;

        function clearActive() {
            document.querySelectorAll(".team-stat").forEach(s => s.classList.remove("active-stat"));
        }

        function animateAndRender(data) {
            const tree = document.querySelector(".org-tree");
            if (tree) tree.classList.add("fade-out");

            setTimeout(() => {
                renderFullTree(data);
                if (tree) tree.classList.remove("fade-out");
            }, 200);
        }

        // --- TOTAL ---
        totalCard.onclick = () => {
            clearActive();
            totalCard.classList.add("active-stat");
            filterLabel.classList.add("d-none");
            animateAndRender(allEmployees);
            window.teamActions.resetView();
        };

        // --- ONLINE ---
        onlineCard.onclick = () => {
            clearActive();
            onlineCard.classList.add("active-stat");
            const onlineUsers = allEmployees.filter(e => e.online);
            filterLabel.innerText = `Showing: Online Users (${onlineUsers.length})`;
            filterLabel.classList.remove("d-none");
            animateAndRender(onlineUsers);
            window.teamActions.resetView();
        };

        // --- DEPARTMENTS ---
        deptCard.onclick = () => {
            clearActive();
            deptCard.classList.add("active-stat");
            const depts = [...new Set(allEmployees.map(e => e.designation?.split(" ")[0] || "General"))];
            const selected = prompt("Select Department:\n\n" + depts.join("\n"));
            if (!selected) return;
            const filtered = allEmployees.filter(e => (e.designation?.split(" ")[0] || "General") === selected);
            filterLabel.innerText = `Showing: ${selected} Department (${filtered.length})`;
            filterLabel.classList.remove("d-none");
            animateAndRender(filtered);
            window.teamActions.resetView();
        };
    }

})();
