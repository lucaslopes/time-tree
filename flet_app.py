import flet as ft
from datetime import datetime
from tinydb import TinyDB, Query

db = TinyDB('time_tree.json')  # Initialize the database

class TimeTree:
    def __init__(self, page: ft.Page) -> None:
        self.page = page
        self.main_attributes()
        self.configure_page()
        self.main_page()
        self.update_entries_list()
    
    def main_attributes(self):
        self.running = False
        self.start_time = None
        self.end_time = None
        self.description = None
        self.current_task = 0
        self.top_bar_title = ft.Text(value="Root")  # Initialize top bar title

    def configure_page(self):
        self.page.bgcolor = ft.colors.BROWN
        self.page.window_width = 350
        self.page.window_height = 450
        self.page.window_resizable = True
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"

    def update_entries_list(self):
        self.entries_list.controls.clear()
        entries = db.search(Query().parent_id == self.current_task)
        for entry in entries:
            list_tile = ft.ListTile(
                title=ft.Text(value=f"{entry['description']}"),
                subtitle=ft.Text(value=f"{entry['start_time']} - {entry['end_time']} - {entry['duration']}s"),
                leading=ft.IconButton(icon=ft.icons.TIMER, on_click=lambda e, entry=entry: self.update_current_task(e, entry))
            )
            self.entries_list.controls.append(list_tile)
        self.entries_list.update()
        self.page.update()

    def update_current_task(self, event, entry):
        self.current_task = entry['doc_id'] if 'doc_id' in entry else entry.doc_id
        self.top_bar_title.value = entry['description'] if len(entry['description']) > 0 else f'#{entry.doc_id}'
        self.update_entries_list()
        self.page.update()

    def go_back(self, _):
        if self.current_task != 0:  # Check if it's not the root
            current_entry = db.get(doc_id = self.current_task)
            parent_id = current_entry['parent_id']
            parent_entry = db.get(doc_id = parent_id) if parent_id != 0 else {'doc_id': 0, 'description': 'Root'}
            if parent_entry:
                self.update_current_task(None, parent_entry)

    def stopper(self):
        self.running = False
        self.end_time = datetime.now()
        duration = self.end_time - self.start_time
        self.description = self.description_input.value
        db.insert({
            'start_time': self.start_time.isoformat(), 
            'end_time': self.end_time.isoformat(), 
            'duration': duration.total_seconds(), 
            'description': self.description,
            'parent_id': self.current_task
        })
        self.description_input.value = ""  # Clear the input
        self.description_input.visible = False  # Hide the input field
        self.entries_list.visible = True  # Show the entries list
        self.main_button.icon = "play_arrow"
        self.main_button.tooltip = "Start Timer"
        self.main_button.bgcolor = ft.colors.GREEN
        self.page.bgcolor = ft.colors.BROWN
        self.update_entries_list()  # Update the entries list after stopping the timer
    
    def starter(self):
        self.running = True
        self.start_time = datetime.now()
        self.end_time = None
        self.description_input.visible = True
        self.entries_list.visible = False
        self.main_button.icon = "stop"
        self.main_button.tooltip = "Stop Timer"
        self.main_button.bgcolor = ft.colors.BROWN
        self.page.bgcolor = ft.colors.GREEN
    
    def toggle_timer(self, _):
        self.stopper() if self.running else self.starter()
        self.page.update()
    
    def main_page(self):
        back_button = ft.IconButton(icon=ft.icons.ARROW_BACK, on_click=self.go_back)
        self.top_bar = ft.Row(controls=[back_button, self.top_bar_title])  # Add back button to top bar
        self.description_input = ft.TextField(hint_text="Enter task description", visible=False)
        self.main_button = ft.FloatingActionButton(icon="play_arrow", tooltip="Start Timer", on_click=self.toggle_timer, bgcolor=ft.colors.GREEN)
        self.entries_list = ft.ListView(height=self.page.window_height * .8)
        self.page.add(self.top_bar)
        self.page.add(self.main_button)
        self.page.add(self.description_input)
        self.page.add(self.entries_list)
        self.update_entries_list()

ft.app(target=TimeTree)
