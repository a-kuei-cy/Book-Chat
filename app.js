
    // ==========================================
    // 已經替換為您的專屬 Google Apps Script 網址
    // ==========================================
    const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzqo0sjyOCxGfQY_V0glcBrGEychvfSs2VYFmZJZSsUq_yS6X6tzPKnB0iInODqdwOY/exec"; 
    
    // 全域變數
    let adminDataCache = [];
    let currentMethods = [];
    let pieChartInstance = null; 

    // --- 核心 API 請求函數 ---


    document.addEventListener('DOMContentLoaded', () => {
      loadGalleryData();
      loadMethods();
    });

    

    // 1. 載入實施方式






    async function handleAddMethod() {
      const input = document.getElementById('newMethodInput');
      const val = input.value.trim();
      if(!val) return;

      document.getElementById('loadingOverlay').style.display = 'flex';
      const res = await apiCall('addMethod', { methodName: val });
      document.getElementById('loadingOverlay').style.display = 'none';
      
      if(res.status === 'success') {
        input.value = '';
        loadMethods();
        Swal.fire({ icon: 'success', title: '新增成功', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
      } else {
        Swal.fire('錯誤', res.message, 'error');
      }
    }

    function handleDeleteMethod(name) {
      Swal.fire({
        title: `刪除 "${name}"?`,
        text: "已使用的舊資料不會被修改，但未來無法再選擇。",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '刪除',
        confirmButtonColor: '#dc3545'
      }).then(async (result) => {
        if (result.isConfirmed) {
          document.getElementById('loadingOverlay').style.display = 'flex';
          const res = await apiCall('deleteMethod', { methodName: name });
          document.getElementById('loadingOverlay').style.display = 'none';
          
          if(res.status === 'success') {
            loadMethods();
            Swal.fire({ icon: 'success', title: '刪除成功', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
          } else {
            Swal.fire('錯誤', res.message, 'error');
          }
        }
      });
    }

    // --- 繪製圓餅圖 (使用更繽紛活潑的色彩) ---
    function renderPieChart(records) {
      const uniqueClasses = new Set();
      if (records) {
        records.forEach(item => {
          // 【修正】確保將班級名稱轉換為字串，避免輸入純數字造成的 .trim() 錯誤
          const clsStr = String(item.className || '');
          if (clsStr) uniqueClasses.add(clsStr.trim());
        });
      }

      const gradeCounts = {
        '一年級': 0, '二年級': 0, '三年級': 0,
        '四年級': 0, '五年級': 0, '六年級': 0, '其他': 0
      };

      uniqueClasses.forEach(cls => {
        let grade = '其他';
        const clsString = String(cls);
        const numMatch = clsString.match(/^([1-6])/); 
        
        if (numMatch && clsString.length >= 3) {
          grade = ['一','二','三','四','五','六'][parseInt(numMatch[1])-1] + '年級';
        } else if (/^一年/.test(clsString)) { grade = '一年級'; }
        else if (/^二年/.test(clsString)) { grade = '二年級'; }
        else if (/^三年/.test(clsString)) { grade = '三年級'; }
        else if (/^四年/.test(clsString)) { grade = '四年級'; }
        else if (/^五年/.test(clsString)) { grade = '五年級'; }
        else if (/^六年/.test(clsString)) { grade = '六年級'; }

        gradeCounts[grade]++;
      });

      const chartLabels = [];
      const chartData = [];
      Object.keys(gradeCounts).forEach(key => {
        if (gradeCounts[key] > 0) {
          chartLabels.push(key);
          chartData.push(gradeCounts[key]);
        }
      });

      document.getElementById('chartSummary').textContent = chartLabels.map((label, i) => `${label} ${chartData[i]} 班`).join('、') || '尚無參與資料';
      if (typeof Chart === 'undefined') return;
      const ctx = document.getElementById('gradePieChart').getContext('2d');
      if (pieChartInstance) { pieChartInstance.destroy(); }

      if (chartData.length > 0) {
        pieChartInstance = new Chart(ctx, {
          type: 'doughnut', 
          data: {
            labels: chartLabels,
            datasets: [{
              data: chartData,
              backgroundColor: ['#4facfe', '#FFB74D', '#FF8A65', '#4DD0E1', '#81C784', '#BA68C8', '#F06292'],
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.8)',
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%', 
            plugins: {
              legend: {
                position: 'right',
                labels: { color: '#ffffff', font: { family: 'Noto Sans TC', weight: 'bold' } }
              },
              tooltip: {
                backgroundColor: 'rgba(255,255,255,0.9)',
                titleColor: '#3AA39F',
                bodyColor: '#2C3E50',
                borderColor: '#3AA39F',
                borderWidth: 1,
                callbacks: {
                  label: function(context) { return ` ${context.label}: ${context.raw} 個班級`; }
                }
              }
            }
          }
        });
      }
    }

    // 2. 成果牆功能


    // 3. 上傳功能




    // 4. 後台管理
    async function performLogin() {
      const pwd = document.getElementById('adminPassword').value;
      const isValid = await apiCall('checkLogin', { password: pwd });
      if (isValid.isValid) {
        document.getElementById('adminLoginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        loadAdminData();
        loadMethods();
      } else {
        Swal.fire('錯誤', '密碼不正確', 'error');
      }
    }

    function logout() {
      document.getElementById('adminPanel').style.display = 'none';
      document.getElementById('adminLoginScreen').style.display = 'flex';
      document.getElementById('adminPassword').value = '';
    }

    async function loadAdminData() {
      const tbody = document.querySelector('#adminTable tbody');
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></td></tr>';
      try {
        const data = await apiCall('getAdminData');
        if (!Array.isArray(data)) throw new Error('管理資料格式不正確');
        adminDataCache = data;
        renderAdminTable(data);
      } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">資料載入失敗，請重新登入再試。</td></tr>';
        throw error;
      }
    }



    const editModal = typeof bootstrap !== 'undefined' ? new bootstrap.Modal(document.getElementById('editModal')) : {show(){alert('介面元件載入失敗，請重新整理。');},hide(){}};

    function openEditModal(rowIndex, className, date, method, book, content) {
      document.getElementById('editRowIndex').value = rowIndex;
      document.getElementById('editClass').value = className;
      document.getElementById('editDate').value = date;
      document.getElementById('editMethod').value = method;
      document.getElementById('editBook').value = book;
      document.getElementById('editContent').value = content;
      editModal.show();
    }

    async function submitEdit() {
      const data = {
        rowIndex: document.getElementById('editRowIndex').value,
        className: document.getElementById('editClass').value,
        date: document.getElementById('editDate').value,
        method: document.getElementById('editMethod').value,
        bookTitle: document.getElementById('editBook').value,
        content: document.getElementById('editContent').value
      };

      document.getElementById('loadingOverlay').style.display = 'flex';

      const res = await apiCall('updateRecord', data);
      document.getElementById('loadingOverlay').style.display = 'none';
      if (res.status === 'success') {
        editModal.hide();
        Swal.fire({icon: 'success', title: '更新成功', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500});
        loadAdminData(); loadGalleryData();
      } else {
        Swal.fire('錯誤', res.message, 'error');
      }
    }

    function deleteItem(rowIndex) {
      Swal.fire({
        title: '確定刪除?',
        text: "刪除後無法復原！",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: '是的，刪除它'
      }).then(async (result) => {
        if (result.isConfirmed) {
          document.getElementById('loadingOverlay').style.display = 'flex';
          const res = await apiCall('deleteRecord', { rowIndex: rowIndex });
          document.getElementById('loadingOverlay').style.display = 'none';
          if (res.status === 'success') {
            Swal.fire({icon: 'success', title: '已刪除', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500});
            loadAdminData(); loadGalleryData();
          } else {
            Swal.fire('錯誤', res.message, 'error');
          }
        }
      });
    }


