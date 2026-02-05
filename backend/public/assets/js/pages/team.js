(function () {
    let allEmployees = [];

    async function initTeam() {
        try {
            allEmployees = await apiGet("/team/my");
            renderFullTree(allEmployees);
            updateStats(allEmployees);
        } catch (e) {
            document.getElementById("orgTreeContainer").innerHTML = "Error loading data.";
        }
    }
    window.initTeam = initTeam;

    function renderFullTree(list) {
        const build = (mgrId) => {
            const children = list.filter(e => e.manager_id === mgrId);
            if (!children.length) return "";
            let html = "<ul>";
            children.forEach(emp => {
                html += `<li>
                    <div class="org-card">
                        <div class="org-avatar">${emp.name.charAt(0)}</div>
                        <div class="org-info">
                            <h5>${emp.name}</h5>
                            <p>${emp.designation || 'Staff'}</p>
                        </div>
                    </div>
                    ${build(emp.id)}
                </li>`;
            });
            return html + "</ul>";
        };
        const rootMgr = list.filter(e => !list.find(p => p.id === e.manager_id))[0]?.manager_id || null;
        document.getElementById("orgTreeContainer").innerHTML = `<div class="org-tree-container">${build(rootMgr)}</div>`;
    }

    function updateStats(list) {
        document.getElementById("statTeamCount").innerText = list.length;
        document.getElementById("statOnlineCount").innerText = list.filter(x => x.online).length;
    }

    window.teamActions = {
        expandAll: () => renderFullTree(allEmployees),
        collapseAll: () => { /* Add collapse logic if needed */ }
    };
})();
