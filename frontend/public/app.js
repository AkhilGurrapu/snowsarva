// Simple JavaScript for Snowsarva Dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('Snowsarva Dashboard loaded successfully');
    
    // Add basic interactivity
    const cards = document.querySelectorAll('.dashboard-card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            const title = this.querySelector('h3').textContent;
            alert(`${title} feature will be available soon in the full React application!`);
        });
        
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        });
    });
    
    // Update time
    function updateTime() {
        const now = new Date();
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = now.toLocaleString();
        }
    }
    
    updateTime();
    setInterval(updateTime, 1000);
});
