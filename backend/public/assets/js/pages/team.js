(function () {
    let allEmployees = [];

    async function initTeam() {
        const container = document.getElementById("orgTreeContainer");
        try {
            // Fetch data
            allEmployees = await apiGet("/team/my");

            if (!allEmployees || allEmployees.length === 0) {
                container.innerHTML = '<div class="text-center py-5">No team members found.</div>';
                return;
            }

            renderFullTree(allEmployees);
            updateStats(allEmployees);
            // Search is temporarily disabled as it requires different logic for horizontal trees
            // setupSearch(); 

        } catch (e) {
            console.error("Team Init Error:", e);
            container.innerHTML = '<div class="text-danger text-center p-3">Error loading organizational chart.</div>';
        }
    }
    window.initTeam = initTeam;

    // --- RECURSIVE TREE RENDERER (Updated for Horizontal Layout) ---
    function renderFullTree(list) {
        // Find root nodes (employees whose manager is not in the list)
        const allIds = list.map(e => e.id);
        const roots = list.filter(e => !e.manager_id || !allIds.includes(e.manager_id));

        const buildNode = (emp) => {
            const children = list.filter(e => e.manager_id === emp.id);
            
            // Determine Role Class for styling
            const roleClass = (emp.role || '').includes('admin') || (emp.designation || '').includes('Manager') 
                ? 'role-manager' 
                : 'role-staff';

            // 1. Build the Card
            let html = `
                <li>
                    <div class="org-card ${roleClass}" onclick="window.teamActions.viewProfile(${emp.id})">
                        <div class="org-avatar">${emp.name.charAt(0)}</div>
                        <span class="org-name">${emp.name}</span>
                        <span class="org-role">${emp.designation || 'Staff'}</span>
                    </div>`;
            
            // 2. Build Children (if any)
            if (children.length > 0) {
                html += `<ul>${children.map(child => buildNode(child)).join('')}</ul>`;
            }

            html += `</li>`;
            return html;
        };

        // Wrap the whole tree in a parent <ul> and container
        const treeHtml = `<ul>${roots.map(root => buildNode(root)).join('')}</ul>`;
        document.getElementById("orgTreeContainer").innerHTML = `<div class="org-tree">${treeHtml}</div>`;
    }

    // --- HELPERS ---
    function updateStats(list) {
        document.getElementById("statTeamCount").innerText = list.length;
        document.getElementById("statOnlineCount").innerText = list.filter(x => x.online).length;
        const depts = new Set(list.map(i => i.designation ? i.designation.split(' ')[0] : 'General'));
        if(document.getElementById("statDeptCount")) {
            document.getElementById("statDeptCount").innerText = depts.size;
        }
    }

    // --- ACTIONS ---
    window.teamActions = {
        viewProfile: (id) => {
            const emp = allEmployees.find(e => e.id == id);
            if (!emp) return;
            const mgr = allEmployees.find(m => m.id == emp.manager_id);

            document.getElementById("modalName").innerText = emp.name;
            document.getElementById("modalRole").innerText = emp.designation || 'Staff';
            if(document.getElementById("modalId")) document.getElementById("modalId").innerText = `#${emp.id}`;
            document.getElementById("modalManager").innerText = mgr ? mgr.name : 'None';
            document.getElementById("modalAvatar").innerText = emp.name.charAt(0);

            const modal = document.getElementById("profileModal");
            modal.classList.remove("hidden");
            setTimeout(() => modal.classList.add("active"), 10);
        },
        closeModal: () => {
            const modal = document.getElementById("profileModal");
            modal.classList.remove("active");
            setTimeout(() => modal.classList.add("hidden"), 300);
        }
    };

    // Close modal on outside click
    document.getElementById("profileModal").addEventListener("click", (e) => {
        if(e.target.id === "profileModal") window.teamActions.closeModal();
    });

})();
